import { getEnv } from "@/lib/env";
import { getBookChapterCount } from "@/lib/study/book-chapters";
import { getBookMetadata } from "@/lib/study/book-metadata";
import {
  OPEN_BIBLE_CROSS_REFERENCES_DOCS,
  OPEN_BIBLE_GEOGRAPHY_DOCS,
  PUBLIC_BIBLE_API_DOCS,
  YOUVERSION_DOCS,
} from "@/lib/study/constants";
import {
  createTimestamp,
  type StudyRunEventHandler,
} from "@/lib/study/events";
import { getModelStackWarnings } from "@/lib/study/models";
import {
  getChapterTextForVersion,
  getChapterTexts,
} from "@/lib/study/providers/bible-text";
import { getGeographyForChapter } from "@/lib/study/providers/geography";
import { getOpenBibleCrossReferences } from "@/lib/study/providers/openbible-cross-references";
import { getStudyNotes } from "@/lib/study/providers/study-notes";
import { parseChapterReference } from "@/lib/study/reference";
import {
  studyContextSchema,
  type NormalizedStudyRequest,
} from "@/lib/study/schemas";

function summarizeChapter(verses: Array<{ verse: string; text: string }>) {
  return verses
    .slice(0, 5)
    .map((verse) => `${verse.verse}. ${verse.text}`)
    .join(" ")
    .slice(0, 720);
}

async function emitContextLog(
  onEvent: StudyRunEventHandler | undefined,
  message: string,
) {
  await onEvent?.({
    type: "log",
    scope: "context",
    target: "context",
    label: "Context",
    message,
    timestamp: createTimestamp(),
  });
}

type BuildStudyContextOptions = {
  onEvent?: StudyRunEventHandler;
};

export async function buildStudyContext(
  input: NormalizedStudyRequest,
  options: BuildStudyContextOptions = {},
) {
  await emitContextLog(
    options.onEvent,
    `Resolving ${input.reference} and loading ${input.versions.length} requested translations.`,
  );
  const parsedReference = parseChapterReference(input.reference);
  const env = getEnv();
  const chapterCount = getBookChapterCount(parsedReference.bookOsis);
  const relatedChapterRefs = [
    parsedReference.startChapter > 1
      ? {
          relation: "previous" as const,
          chapter: parsedReference.startChapter - 1,
        }
      : null,
    parsedReference.endChapter < chapterCount
      ? {
          relation: "next" as const,
          chapter: parsedReference.endChapter + 1,
        }
      : null,
  ].filter(
    (
      entry,
    ): entry is {
      relation: "previous" | "next";
      chapter: number;
    } => entry !== null,
  );
  await emitContextLog(
    options.onEvent,
    relatedChapterRefs.length
      ? `Preparing adjacent chapter context for ${relatedChapterRefs
          .map((entry) => `${parsedReference.book.name} ${entry.chapter}`)
          .join(" and ")}.`
      : "No adjacent chapter context is available because the selection is at a book boundary.",
  );
  const [chapterTextsResult, relatedChapters, geography, studyNotesResult] =
    await Promise.all([
      getChapterTexts(parsedReference, input.versions),
      Promise.all(
        relatedChapterRefs.map(async (entry) => {
          const relatedReference = {
            ...parsedReference,
            reference: `${parsedReference.book.name} ${entry.chapter}`,
            osis: `${parsedReference.bookOsis}.${entry.chapter}`,
            chapter: entry.chapter,
            startChapter: entry.chapter,
            endChapter: entry.chapter,
            chapters: [entry.chapter],
          };
          const result = await getChapterTextForVersion(
            relatedReference,
            input.versions[0],
          );

          return {
            reference: relatedReference.reference,
            relation: entry.relation,
            versionId: result.text.versionId,
            versionLabel: result.text.versionLabel,
            summary: summarizeChapter(result.text.verses),
            verses: result.text.verses,
          };
        }),
      ),
      getGeographyForChapter(parsedReference),
      getStudyNotes(parsedReference),
    ]);
  const openBibleCrossReferencesResult = await getOpenBibleCrossReferences(
    parsedReference,
    chapterTextsResult.texts[0]?.verses ?? [],
  );
  await emitContextLog(
    options.onEvent,
    `Loaded ${chapterTextsResult.texts.length} primary translations, ${relatedChapters.length} adjacent chapters, ${geography.length} geography matches, ${openBibleCrossReferencesResult.groups.length} OpenBible cross-reference groups, and ${studyNotesResult.notes.length} supplemental notes.`,
  );
  const youVersionApiServed = chapterTextsResult.providerUsage.filter(
    (entry) => entry.provider === "youversion-api",
  );
  const youVersionWebServed = chapterTextsResult.providerUsage.filter(
    (entry) => entry.provider === "youversion-web",
  );
  const publicServed = chapterTextsResult.providerUsage.filter(
    (entry) => entry.provider === "public",
  );
  const diagnostics = [
    ...chapterTextsResult.warnings,
    ...openBibleCrossReferencesResult.warnings,
    ...studyNotesResult.warnings,
    ...getModelStackWarnings(),
  ];

  if (!geography.length) {
    diagnostics.push(
      `No explicit geography matches were found in OpenBible's place dataset for ${parsedReference.reference}.`,
    );
  }

  if (!openBibleCrossReferencesResult.groups.length) {
    diagnostics.push(
      `No OpenBible cross-reference groups were returned for ${parsedReference.reference}.`,
    );
  }

  if (relatedChapters.length) {
    diagnostics.push(
      `Related context includes ${relatedChapters
        .map((chapter) => `${chapter.relation} chapter ${chapter.reference}`)
        .join(" and ")} via ${relatedChapters[0]?.versionId}.`,
    );
  }

  if (youVersionApiServed.length > 0) {
    diagnostics.push(
      `YouVersion API served ${youVersionApiServed.length}/${input.versions.length} selected translations: ${youVersionApiServed
        .map((entry) => entry.versionId)
        .join(", ")}.`,
    );
  }

  if (youVersionWebServed.length > 0) {
    diagnostics.push(
      `Bible.com fallback served ${youVersionWebServed.length}/${input.versions.length} selected translations: ${youVersionWebServed
        .map((entry) => entry.versionId)
        .join(", ")}.`,
    );
  } else if (!env.YVP_APP_KEY) {
    diagnostics.push(
      "YouVersion is not active yet because no YouVersion app key was found, so the app is using the public multi-version Bible source for passage text.",
    );
  } else if (youVersionApiServed.length === 0) {
    diagnostics.push(
      "A YouVersion key is present, but none of the selected translations were served directly by the licensed API.",
    );
  }

  return studyContextSchema.parse({
    parsedReference: {
      ...parsedReference,
      book: getBookMetadata(parsedReference.bookOsis),
    },
    versions: chapterTextsResult.texts,
    relatedChapters,
    geography,
    openBibleCrossReferences: openBibleCrossReferencesResult.groups,
    studyNotes: studyNotesResult.notes,
    sourceDiagnostics: diagnostics,
    sourceCatalog: [
      {
        label: "Public Bible API",
        url: PUBLIC_BIBLE_API_DOCS,
        status:
          publicServed.length > 0
            ? youVersionApiServed.length > 0 || youVersionWebServed.length > 0
              ? ("fallback" as const)
              : ("active" as const)
            : ("inactive" as const),
        note:
          publicServed.length > 0
            ? youVersionApiServed.length > 0 || youVersionWebServed.length > 0
              ? `Used as fallback for ${publicServed
                  .map((entry) => entry.versionId)
                  .join(", ")}.`
              : "Primary text source for the selected passage."
            : "Not used because the requested translations were served without the public provider.",
      },
      {
        label: "OpenBible Geography",
        url: OPEN_BIBLE_GEOGRAPHY_DOCS,
        status: "active" as const,
        note: "Geographic place mentions, location context, historical notes, and place-photo matches when available.",
      },
      {
        label: "OpenBible Cross References",
        url: OPEN_BIBLE_CROSS_REFERENCES_DOCS,
        status: openBibleCrossReferencesResult.groups.length
          ? ("active" as const)
          : ("fallback" as const),
        note: openBibleCrossReferencesResult.groups.length
          ? `Loaded cross-reference candidates for ${openBibleCrossReferencesResult.groups.length} verse${openBibleCrossReferencesResult.groups.length === 1 ? "" : "s"}.`
          : "Queried OpenBible Labs, but no cross-reference candidates were returned.",
      },
      {
        label: "YouVersion API",
        url: YOUVERSION_DOCS,
        status:
          youVersionApiServed.length > 0
            ? ("active" as const)
            : env.YVP_APP_KEY
              ? ("fallback" as const)
              : ("inactive" as const),
        note:
          youVersionApiServed.length > 0
            ? `Served ${youVersionApiServed
                .map((entry) => entry.versionId)
                .join(", ")} through the live licensed API.`
            : youVersionWebServed.length > 0
              ? `Direct API access was denied for ${youVersionWebServed
                  .map((entry) => entry.versionId)
                  .join(", ")}, so Bible.com fallback was used instead.`
            : env.YVP_APP_KEY
              ? "Key present, but none of the selected version aliases were served by the direct YouVersion API for this request."
              : "Requires YVP_APP_KEY or YV_APP_KEY before the live adapter can run.",
      },
      studyNotesResult.catalogEntry,
    ],
  });
}
