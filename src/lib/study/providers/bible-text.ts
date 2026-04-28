import { load } from "cheerio";
import {
  PUBLIC_BIBLE_API_DOCS,
  VERSION_SOURCE_URL,
  YOUVERSION_DOCS,
} from "@/lib/study/constants";
import { getEnv } from "@/lib/env";
import { getUsfmCode } from "@/lib/study/book-codes";
import type { ParsedReference } from "@/lib/study/schemas";
import {
  chapterTextSchema,
  versionMetadataSchema,
  verseSchema,
  type BookContext,
} from "@/lib/study/schemas";

type ChapterTextResult = Awaited<ReturnType<typeof chapterTextSchema.parse>>;

type PublicBibleVersion = {
  id: string;
  version: string;
  description?: string;
  scope?: string;
  copyright?: string;
  language?: {
    name?: string;
  };
};

type PublicBibleChapterResponse = {
  data?: Array<{
    verse?: string;
    text?: string;
  }>;
};

type YouVersionBible = {
  id: number;
  abbreviation?: string;
  title?: string;
  copyright?: string;
  language_tag?: string;
};

type YouVersionVerseListing = {
  data?: Array<{
    id?: string;
    passage_id?: string;
    title?: string;
  }>;
};

type YouVersionPassage = {
  id?: string;
  content?: string;
  reference?: string;
};

type ChapterProvider = "youversion-api" | "youversion-web" | "public" | "mixed";

export type ChapterProviderUsage = {
  provider: ChapterProvider;
  versionId: string;
};

let versionCatalogPromise: Promise<Map<string, PublicBibleVersion>> | null = null;
const youVersionBiblePromiseCache = new Map<number, Promise<YouVersionBible>>();

const YOUVERSION_VERSION_ALIASES: Record<string, number> = {
  "en-kjv": 1,
  kjv: 1,
  "en-asv": 12,
  asv: 12,
  "en-cpdv": 42,
  cpdv: 42,
  "en-gnv": 2163,
  gnv: 2163,
  "en-lsv": 2660,
  lsv: 2660,
  "en-bsb": 3034,
  bsb: 3034,
  "en-cev": 392,
  cev: 392,
  "en-fbv": 1932,
  fbv: 1932,
  "en-webus": 206,
  webus: 206,
  "en-webbe": 1204,
  webbe: 1204,
  "en-wmb": 1209,
  wmb: 1209,
  "en-wmbbe": 1207,
  wmbbe: 1207,
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    next: { revalidate: 60 * 60 * 24 },
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return (await response.json()) as T;
}

async function fetchYouVersionJson<T>(path: string): Promise<T> {
  const env = getEnv();

  if (!env.YVP_APP_KEY) {
    throw new Error("YouVersion is not configured.");
  }

  const response = await fetch(`https://api.youversion.com/v1${path}`, {
    headers: {
      "X-YVP-App-Key": env.YVP_APP_KEY,
    },
    signal: AbortSignal.timeout(20_000),
    next: { revalidate: 60 * 60 },
  });

  if (!response.ok) {
    throw new Error(
      `YouVersion request failed (${response.status}) for ${path}.`,
    );
  }

  return (await response.json()) as T;
}

async function getVersionCatalog() {
  if (!versionCatalogPromise) {
    versionCatalogPromise = fetchJson<PublicBibleVersion[]>(VERSION_SOURCE_URL).then(
      (versions) =>
        new Map(
          versions
            .filter((version) => typeof version.id === "string")
            .map((version) => [version.id, version]),
        ),
    );
  }

  return versionCatalogPromise;
}

async function getPublicVersionMetadata(versionId: string) {
  const catalog = await getVersionCatalog();
  const version = catalog.get(versionId);

  if (!version) {
    throw new Error(`Bible version "${versionId}" was not found.`);
  }

  return versionMetadataSchema.parse({
    id: version.id,
    label: version.version ?? version.id,
    description: version.description ?? version.version ?? version.id,
    language: version.language?.name ?? "Unknown",
    scope: version.scope ?? "Bible",
    copyright: version.copyright ?? "Check provider metadata.",
    sourceUrl: PUBLIC_BIBLE_API_DOCS,
  });
}

async function getYouVersionBible(versionId: number) {
  const cached = youVersionBiblePromiseCache.get(versionId);

  if (cached) {
    return cached;
  }

  const promise = fetchYouVersionJson<YouVersionBible>(`/bibles/${versionId}`);
  youVersionBiblePromiseCache.set(versionId, promise);

  return promise;
}

function buildPublicChapterUrl(
  book: BookContext,
  chapter: number,
  versionId: string,
) {
  return `https://cdn.jsdelivr.net/gh/wldeh/bible-api/bibles/${versionId}/books/${book.apiSlug}/chapters/${chapter}.json`;
}

function decodeHtmlEntities(value: string) {
  const namedEntities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&nbsp;": " ",
  };

  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(
      /&(amp|lt|gt|quot|nbsp|#39);/g,
      (entity) => namedEntities[entity] ?? entity,
    );
}

async function getPublicChapterTextForVersion(
  parsedReference: ParsedReference,
  versionId: string,
) {
  const metadata = await getPublicVersionMetadata(versionId);
  const url = buildPublicChapterUrl(
    parsedReference.book,
    parsedReference.chapter,
    versionId,
  );
  const payload = await fetchJson<PublicBibleChapterResponse>(url);
  const verses = (payload.data ?? []).map((verse) =>
    verseSchema.parse({
      verse: verse.verse ?? "?",
      text: verse.text ?? "",
    }),
  );

  if (!verses.length) {
    throw new Error(
      `No verses were returned for ${parsedReference.reference} in ${versionId}.`,
    );
  }

  return chapterTextSchema.parse({
    versionId: metadata.id,
    versionLabel: metadata.label,
    description: metadata.description,
    language: metadata.language,
    scope: metadata.scope,
    attribution: metadata.copyright,
    sourceUrl: url,
    verses,
  });
}

function resolveYouVersionVersionId(versionId: string) {
  return YOUVERSION_VERSION_ALIASES[versionId.toLowerCase()] ?? null;
}

async function mapWithConcurrency<T, U>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<U>,
) {
  const results: U[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );

  return results;
}

async function getYouVersionChapterTextForVersion(
  parsedReference: ParsedReference,
  versionId: string,
) {
  const youVersionId = resolveYouVersionVersionId(versionId);

  if (!youVersionId) {
    throw new Error(`No YouVersion mapping exists for "${versionId}".`);
  }

  const [bible, verseList] = await Promise.all([
    getYouVersionBible(youVersionId),
    fetchYouVersionJson<YouVersionVerseListing>(
      `/bibles/${youVersionId}/books/${getUsfmCode(
        parsedReference.bookOsis,
      )}/chapters/${parsedReference.chapter}/verses`,
    ),
  ]);
  const versesForChapter = verseList.data ?? [];

  if (!versesForChapter.length) {
    throw new Error(
      `YouVersion returned no verses for ${parsedReference.reference} in ${versionId}.`,
    );
  }

  const passages = await mapWithConcurrency(
    versesForChapter,
    8,
    async (verse) => {
      if (!verse.passage_id) {
        throw new Error(
          `YouVersion verse listing was missing a passage_id for ${versionId}.`,
        );
      }

      return fetchYouVersionJson<YouVersionPassage>(
        `/bibles/${youVersionId}/passages/${verse.passage_id}`,
      );
    },
  );
  const verses = passages.map((passage, index) =>
    verseSchema.parse({
      verse:
        versesForChapter[index]?.title ??
        passage.id?.split(".").at(-1) ??
        `${index + 1}`,
      text: passage.content ?? "",
    }),
  );

  return chapterTextSchema.parse({
    versionId,
    versionLabel: bible.title ?? bible.abbreviation ?? versionId,
    description: bible.title ?? bible.abbreviation ?? versionId,
    language: bible.language_tag ?? "en",
    scope: "Bible",
    attribution: bible.copyright ?? "See YouVersion license terms.",
    sourceUrl: `${YOUVERSION_DOCS}`,
    verses,
  });
}

function buildBibleDotComChapterUrl(
  parsedReference: ParsedReference,
  youVersionId: number,
  abbreviation: string,
) {
  return `https://www.bible.com/bible/${youVersionId}/${getUsfmCode(
    parsedReference.bookOsis,
  )}.${parsedReference.chapter}.${encodeURIComponent(abbreviation)}`;
}

async function getBibleDotComChapterTextForVersion(
  parsedReference: ParsedReference,
  versionId: string,
) {
  const youVersionId = resolveYouVersionVersionId(versionId);

  if (!youVersionId) {
    throw new Error(`No Bible.com mapping exists for "${versionId}".`);
  }

  const bible = await getYouVersionBible(youVersionId);
  const abbreviation = bible.abbreviation ?? versionId.replace(/^en-/, "").toUpperCase();
  const url = buildBibleDotComChapterUrl(parsedReference, youVersionId, abbreviation);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Bible.com chapter page failed to load (${response.status}) for ${versionId}.`,
    );
  }

  const html = await response.text();
  const $ = load(html);
  const usfmPrefix = `${getUsfmCode(parsedReference.bookOsis)}.${parsedReference.chapter}.`;
  const coveredVerseNumbers = new Set<string>();
  const verses = $(`[data-usfm^="${usfmPrefix}"]`)
    .toArray()
    .flatMap((node) => {
      const usfm = $(node).attr("data-usfm");
      const className = $(node).attr("class") ?? "";

      if (!usfm || !className.includes("verse")) {
        return [];
      }

      const labelNode = $(node)
        .children()
        .toArray()
        .find((child) => (($(child).attr("class") ?? "").includes("label")));
      const labelText = labelNode ? $(labelNode).text().trim() : undefined;
      const verseNumber = labelText || usfm.split(".").at(-1);
      const coveredNumbers =
        labelText?.match(/\d+/g) ??
        (verseNumber ? [verseNumber] : []);

      if (
        !verseNumber ||
        coveredNumbers.some((number) => coveredVerseNumbers.has(number))
      ) {
        return [];
      }

      coveredNumbers.forEach((number) => coveredVerseNumbers.add(number));
      const text = $(node)
        .children()
        .toArray()
        .flatMap((child) => {
          const childClass = $(child).attr("class") ?? "";

          if (childClass.includes("label")) {
            return [];
          }

          return [$(child).text()];
        })
        .join(" ");

      return [
        verseSchema.parse({
          verse: verseNumber,
          text: decodeHtmlEntities(text).replace(/\s+/g, " ").trim(),
        }),
      ];
    });

  if (!verses.length) {
    throw new Error(
      `Bible.com did not expose verse spans for ${parsedReference.reference} in ${versionId}.`,
    );
  }

  return chapterTextSchema.parse({
    versionId,
    versionLabel: bible.title ?? bible.abbreviation ?? versionId,
    description: bible.title ?? bible.abbreviation ?? versionId,
    language: bible.language_tag ?? "en",
    scope: "Bible",
    attribution: bible.copyright ?? "See YouVersion license terms.",
    sourceUrl: url,
    verses,
  });
}

async function getSingleChapterTextForVersion(
  parsedReference: ParsedReference,
  versionId: string,
): Promise<{ text: ChapterTextResult; provider: ChapterProvider; warnings: string[] }> {
  const env = getEnv();
  const warnings: string[] = [];

  if (env.YVP_APP_KEY && resolveYouVersionVersionId(versionId)) {
    try {
      const text = await getYouVersionChapterTextForVersion(
        parsedReference,
        versionId,
      );

      return {
        text,
        provider: "youversion-api",
        warnings,
      };
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `${error.message} Falling back to the public provider for ${versionId}.`
          : `YouVersion failed for ${versionId}. Falling back to the public provider.`,
      );

      try {
        const text = await getBibleDotComChapterTextForVersion(
          parsedReference,
          versionId,
        );

        warnings.push(
          `Bible.com reader fallback served ${versionId} because the licensed YouVersion passage API denied direct access.`,
        );

        return {
          text,
          provider: "youversion-web",
          warnings,
        };
      } catch (webFallbackError) {
        warnings.push(
          webFallbackError instanceof Error
            ? `${webFallbackError.message} Falling back to the public provider for ${versionId}.`
            : `Bible.com fallback failed for ${versionId}. Falling back to the public provider.`,
        );
      }
    }
  }

  return {
    text: await getPublicChapterTextForVersion(parsedReference, versionId),
    provider: "public",
    warnings,
  };
}

function buildSingleChapterReference(
  parsedReference: ParsedReference,
  chapter: number,
): ParsedReference {
  return {
    ...parsedReference,
    reference: `${parsedReference.book.name} ${chapter}`,
    osis: `${parsedReference.bookOsis}.${chapter}`,
    chapter,
    startChapter: chapter,
    endChapter: chapter,
    chapters: [chapter],
  };
}

function addChapterPrefixToVerses(
  chapter: number,
  verses: ChapterTextResult["verses"],
  includeChapterPrefix: boolean,
) {
  if (!includeChapterPrefix) {
    return verses;
  }

  return verses.map((verse) => ({
    ...verse,
    verse: `${chapter}:${verse.verse}`,
  }));
}

function mergeChapterTextResults(
  parsedReference: ParsedReference,
  results: Array<{
    chapter: number;
    result: Awaited<ReturnType<typeof getSingleChapterTextForVersion>>;
  }>,
) {
  const first = results[0]?.result.text;

  if (!first) {
    throw new Error(`No verses were returned for ${parsedReference.reference}.`);
  }

  const providers = new Set(results.map((entry) => entry.result.provider));
  const provider =
    providers.size === 1
      ? (Array.from(providers)[0] as ChapterProvider)
      : ("mixed" as const);
  const includeChapterPrefix = (parsedReference.chapters?.length ?? 1) > 1;

  return {
    text: chapterTextSchema.parse({
      versionId: first.versionId,
      versionLabel: first.versionLabel,
      description: first.description,
      language: first.language,
      scope: first.scope,
      attribution: first.attribution,
      sourceUrl: first.sourceUrl,
      verses: results.flatMap((entry) =>
        addChapterPrefixToVerses(
          entry.chapter,
          entry.result.text.verses,
          includeChapterPrefix,
        ),
      ),
    }),
    provider,
    warnings: results.flatMap((entry) => entry.result.warnings),
  };
}

export async function getChapterTextForVersion(
  parsedReference: ParsedReference,
  versionId: string,
): Promise<{ text: ChapterTextResult; provider: ChapterProvider; warnings: string[] }> {
  const chapters = parsedReference.chapters ?? [parsedReference.chapter];

  if (chapters.length === 1) {
    return getSingleChapterTextForVersion(parsedReference, versionId);
  }

  const results = await mapWithConcurrency(
    chapters,
    2,
    async (chapter) => ({
      chapter,
      result: await getSingleChapterTextForVersion(
        buildSingleChapterReference(parsedReference, chapter),
        versionId,
      ),
    }),
  );

  return mergeChapterTextResults(parsedReference, results);
}

export async function getChapterTexts(
  parsedReference: ParsedReference,
  versionIds: string[],
) {
  const settled = await Promise.allSettled(
    versionIds.map((versionId) =>
      getChapterTextForVersion(parsedReference, versionId),
    ),
  );
  const texts = settled
    .filter(
      (result): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof getChapterTextForVersion>>
      > => result.status === "fulfilled",
    )
    .map((result) => result.value.text);
  const providerUsage = settled
    .filter(
      (result): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof getChapterTextForVersion>>
      > => result.status === "fulfilled",
    )
    .map((result) => ({
      versionId: result.value.text.versionId,
      provider: result.value.provider,
    }));
  const warnings = settled
    .filter(
      (result): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof getChapterTextForVersion>>
      > => result.status === "fulfilled",
    )
    .flatMap((result) => result.value.warnings)
    .concat(
      settled
        .filter(
          (result): result is PromiseRejectedResult =>
            result.status === "rejected",
        )
        .map((result) => result.reason)
        .map((error) =>
          error instanceof Error
            ? error.message
            : "A Bible version failed to load.",
        ),
    );

  if (texts.length < 2) {
    throw new Error(
      "At least two passage translations are required to compare the study text.",
    );
  }

  return { texts, warnings, providerUsage };
}
