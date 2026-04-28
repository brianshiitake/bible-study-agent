import { randomUUID } from "node:crypto";
import { ensureDatabaseSchema, getSql, hasDatabaseConnection } from "@/lib/db";
import {
  persistedStudyResultSchema,
  studyRunSummarySchema,
  type PersistedStudyResult,
  type StudyResult,
  type StudyRunSummary,
} from "@/lib/study/schemas";

function slugifyReference(reference: string) {
  return reference
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function createStudySlug(reference: string, id: string) {
  return `${slugifyReference(reference)}-${id.slice(0, 8)}`;
}

function normalizeLegacyParsedReference(parsedReference: Record<string, unknown>) {
  const chapter =
    typeof parsedReference.chapter === "number" ? parsedReference.chapter : 1;
  const startChapter =
    typeof parsedReference.startChapter === "number"
      ? parsedReference.startChapter
      : chapter;
  const endChapter =
    typeof parsedReference.endChapter === "number"
      ? parsedReference.endChapter
      : startChapter;
  const chapters = Array.isArray(parsedReference.chapters)
    ? parsedReference.chapters
    : Array.from(
        { length: Math.max(1, endChapter - startChapter + 1) },
        (_, index) => startChapter + index,
      );

  return {
    ...parsedReference,
    startChapter,
    endChapter,
    chapters,
    chapter,
  };
}

function normalizePersistedStudyPayload(rawPayload: PersistedStudyResult | string) {
  const payload = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;

  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const record = payload as Record<string, unknown>;
  const context =
    record.context && typeof record.context === "object"
      ? (record.context as Record<string, unknown>)
      : {};
  const parsedReference =
    context.parsedReference && typeof context.parsedReference === "object"
      ? (context.parsedReference as Record<string, unknown>)
      : {};
  const book =
    parsedReference.book && typeof parsedReference.book === "object"
      ? (parsedReference.book as Record<string, unknown>)
      : {};
  const finalSynthesis =
    record.finalSynthesis && typeof record.finalSynthesis === "object"
      ? (record.finalSynthesis as Record<string, unknown>)
      : {};
  const versions = Array.isArray(context.versions) ? context.versions : [];
  const firstVersion =
    versions[0] && typeof versions[0] === "object"
      ? (versions[0] as Record<string, unknown>)
      : {};
  const firstVersionVerses = Array.isArray(firstVersion.verses)
    ? firstVersion.verses
    : [];
  const fallbackTerm =
    typeof book.name === "string"
      ? book.name
      : typeof parsedReference.reference === "string"
        ? parsedReference.reference
        : "Study context";

  return {
    ...record,
    context: {
      ...context,
      parsedReference: normalizeLegacyParsedReference(parsedReference),
      relatedChapters: Array.isArray(context.relatedChapters)
        ? context.relatedChapters
        : [],
      openBibleCrossReferences: Array.isArray(context.openBibleCrossReferences)
        ? context.openBibleCrossReferences
        : [],
    },
    finalSynthesis: {
      ...finalSynthesis,
      verseBreakdown: Array.isArray(finalSynthesis.verseBreakdown)
        ? finalSynthesis.verseBreakdown
        : firstVersionVerses.length
          ? firstVersionVerses.map((verse) => {
              const verseRecord =
                verse && typeof verse === "object"
                  ? (verse as Record<string, unknown>)
                  : {};
              const verseLabel =
                typeof verseRecord.verse === "string"
                  ? verseRecord.verse
                  : "Verse";

              return {
                verse: verseLabel,
                meaning:
                  "Verse-by-verse notes were unavailable in this legacy study record.",
                jesusContext:
                  "Rerun the study to generate Jesus-context notes for this verse.",
                significance:
                  "Rerun the study to generate significance and undertone notes for this verse.",
                crossReferences: [
                  {
                    reference:
                      typeof parsedReference.reference === "string"
                        ? parsedReference.reference
                        : "Selected passage",
                    relevance:
                      "Legacy fallback reference generated while loading an older study.",
                  },
                ],
              };
            })
          : [
              {
                verse:
                  typeof parsedReference.reference === "string"
                    ? parsedReference.reference
                    : "Selected passage",
                meaning:
                  "Verse-by-verse notes were unavailable in this legacy study record.",
                jesusContext:
                  "Rerun the study to generate Jesus-context notes.",
                significance:
                  "Rerun the study to generate significance and undertone notes.",
                crossReferences: [
                  {
                    reference:
                      typeof parsedReference.reference === "string"
                        ? parsedReference.reference
                        : "Selected passage",
                    relevance:
                      "Legacy fallback reference generated while loading an older study.",
                  },
                ],
              },
            ],
      pronunciationGuide: Array.isArray(finalSynthesis.pronunciationGuide)
        ? finalSynthesis.pronunciationGuide
        : [
            {
              term: fallbackTerm,
              phonetic: fallbackTerm,
              type: "term",
              explanation:
                "Pronunciation guidance was unavailable in this legacy study record.",
            },
          ],
    },
  };
}

function toSummary(result: PersistedStudyResult): StudyRunSummary {
  return studyRunSummarySchema.parse({
    id: result.id,
    slug: result.slug,
    reference: result.context.parsedReference.reference,
    focusQuestion: result.request.focusQuestion,
    createdAt: result.generatedAt,
    versionIds: result.context.versions.map((version) => version.versionId),
    finalThesis: result.finalSynthesis.thesis,
    confidence: result.finalSynthesis.confidence,
  });
}

export function canPersistStudies() {
  return hasDatabaseConnection();
}

export async function persistStudyResult(result: StudyResult) {
  await ensureDatabaseSchema();

  const id = randomUUID();
  const slug = createStudySlug(result.context.parsedReference.reference, id);
  const persisted = persistedStudyResultSchema.parse({
    ...result,
    id,
    slug,
  });
  const sql = getSql();

  await sql`
    insert into study_runs (
      id,
      slug,
      reference,
      focus_question,
      created_at,
      version_ids,
      final_thesis,
      confidence,
      result_payload
    ) values (
      ${persisted.id},
      ${persisted.slug},
      ${persisted.context.parsedReference.reference},
      ${persisted.request.focusQuestion ?? null},
      ${persisted.generatedAt},
      ${JSON.stringify(persisted.context.versions.map((version) => version.versionId))}::jsonb,
      ${persisted.finalSynthesis.thesis},
      ${persisted.finalSynthesis.confidence},
      ${JSON.stringify(persisted)}::jsonb
    )
  `;

  return persisted;
}

export async function getStudyRunBySlug(slug: string) {
  if (!canPersistStudies()) {
    return null;
  }

  await ensureDatabaseSchema();
  const sql = getSql();
  const rows = await sql<Array<{ result_payload: PersistedStudyResult }>>`
    select result_payload
    from study_runs
    where slug = ${slug}
    limit 1
  `;
  const rawPayload = rows[0]?.result_payload;

  if (!rawPayload) {
    return null;
  }

  // PostgreSQL may return JSONB as a string or parsed object depending on driver/version
  const payload = normalizePersistedStudyPayload(rawPayload);

  return persistedStudyResultSchema.parse(payload);
}

export async function getStudyRunById(id: string) {
  if (!canPersistStudies()) {
    return null;
  }

  await ensureDatabaseSchema();
  const sql = getSql();
  const rows = await sql<Array<{ result_payload: PersistedStudyResult }>>`
    select result_payload
    from study_runs
    where id = ${id}
    limit 1
  `;
  const rawPayload = rows[0]?.result_payload;

  if (!rawPayload) {
    return null;
  }

  const payload = normalizePersistedStudyPayload(rawPayload);

  return persistedStudyResultSchema.parse(payload);
}

export async function listRecentStudyRuns(limit = 12) {
  if (!canPersistStudies()) {
    return [] satisfies StudyRunSummary[];
  }

  await ensureDatabaseSchema();
  const sql = getSql();
  const rows = await sql<
    Array<{
      id: string;
      slug: string;
      reference: string;
      focus_question: string | null;
      created_at: string | Date;
      version_ids: string[] | string;
      final_thesis: string;
      confidence: "low" | "medium" | "high";
    }>
  >`
    select
      id,
      slug,
      reference,
      focus_question,
      created_at,
      version_ids,
      final_thesis,
      confidence
    from study_runs
    order by created_at desc
    limit ${limit}
  `;

  return rows.map((row) =>
    studyRunSummarySchema.parse({
      id: row.id,
      slug: row.slug,
      reference: row.reference,
      focusQuestion: row.focus_question ?? undefined,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      versionIds:
        Array.isArray(row.version_ids)
          ? row.version_ids
          : JSON.parse(String(row.version_ids)),
      finalThesis: row.final_thesis,
      confidence: row.confidence,
    }),
  );
}

export function summarizeStudyRun(result: PersistedStudyResult) {
  return toSummary(result);
}
