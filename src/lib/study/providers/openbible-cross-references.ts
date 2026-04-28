import { load } from "cheerio";
import {
  OPEN_BIBLE_CROSS_REFERENCES_DOCS,
  OPEN_BIBLE_CROSS_REFERENCES_URL,
} from "@/lib/study/constants";
import type { ParsedReference } from "@/lib/study/schemas";
import { openBibleCrossReferenceGroupSchema } from "@/lib/study/schemas";

const MAX_SOURCE_VERSES = 36;
const MAX_REFERENCES_PER_VERSE = 6;

type VerseLike = {
  verse: string;
  text: string;
};

function normalizeVerseLabel(label: string) {
  const chapterAndVerse = label.match(/^(\d+):(\d+)/);

  if (chapterAndVerse) {
    return {
      chapter: Number(chapterAndVerse[1]),
      verse: Number(chapterAndVerse[2]),
    };
  }

  const verseOnly = label.match(/^(\d+)/);

  if (!verseOnly) {
    return null;
  }

  return {
    chapter: null,
    verse: Number(verseOnly[1]),
  };
}

function toSourceReference(parsedReference: ParsedReference, verse: VerseLike) {
  const normalized = normalizeVerseLabel(verse.verse);

  if (!normalized) {
    return null;
  }

  return `${parsedReference.book.name} ${
    normalized.chapter ?? parsedReference.startChapter
  }:${normalized.verse}`;
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

async function fetchCrossReferences(sourceVerse: string) {
  const url = new URL(OPEN_BIBLE_CROSS_REFERENCES_URL);
  url.searchParams.set("q", sourceVerse);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    next: { revalidate: 60 * 60 * 24 * 7 },
  });

  if (!response.ok) {
    throw new Error(
      `OpenBible cross references failed to load (${response.status}) for ${sourceVerse}.`,
    );
  }

  const html = await response.text();
  const $ = load(html);
  const references = $("h3 a")
    .toArray()
    .map((node) => ({
      reference: $(node).text().replace(/\s+/g, " ").trim(),
      sourceUrl: new URL($(node).attr("href") ?? "", url).toString(),
    }))
    .filter((entry) => entry.reference)
    .slice(0, MAX_REFERENCES_PER_VERSE);

  return openBibleCrossReferenceGroupSchema.parse({
    sourceVerse,
    sourceUrl: url.toString(),
    references,
  });
}

export async function getOpenBibleCrossReferences(
  parsedReference: ParsedReference,
  verses: VerseLike[],
) {
  const sourceVerses = Array.from(
    new Set(
      verses
        .map((verse) => toSourceReference(parsedReference, verse))
        .filter((reference): reference is string => Boolean(reference)),
    ),
  ).slice(0, MAX_SOURCE_VERSES);

  if (!sourceVerses.length) {
    return {
      groups: [],
      warnings: [
        `OpenBible cross references were unavailable because no verse labels could be resolved for ${parsedReference.reference}.`,
      ],
      catalogEntry: {
        label: "OpenBible Cross References",
        url: OPEN_BIBLE_CROSS_REFERENCES_DOCS,
        status: "inactive" as const,
        note: "No verse labels were available to query.",
      },
    };
  }

  const settled = await mapWithConcurrency(sourceVerses, 4, async (sourceVerse) => {
    try {
      return {
        status: "fulfilled" as const,
        value: await fetchCrossReferences(sourceVerse),
      };
    } catch (reason) {
      return {
        status: "rejected" as const,
        reason,
      };
    }
  });
  const groups = settled
    .filter(
      (result): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof fetchCrossReferences>>
      > => result.status === "fulfilled",
    )
    .filter((result) => result.value.references.length)
    .map((result) => result.value);
  const warnings = settled
    .filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    )
    .map((result) =>
      result.reason instanceof Error
        ? result.reason.message
        : "An OpenBible cross-reference lookup failed.",
    );

  if (verses.length > MAX_SOURCE_VERSES) {
    warnings.push(
      `OpenBible cross-reference lookups were capped at the first ${MAX_SOURCE_VERSES} verses for runtime control.`,
    );
  }

  return {
    groups,
    warnings,
    catalogEntry: {
      label: "OpenBible Cross References",
      url: OPEN_BIBLE_CROSS_REFERENCES_DOCS,
      status: groups.length ? ("active" as const) : ("fallback" as const),
      note: groups.length
        ? `Loaded top cross-reference candidates for ${groups.length} verse${groups.length === 1 ? "" : "s"} from OpenBible Labs.`
        : "OpenBible was queried, but no cross-reference candidates were returned.",
    },
  };
}
