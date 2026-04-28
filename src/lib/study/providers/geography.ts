import {
  OPEN_BIBLE_GEOGRAPHY_DATA_URL,
  OPEN_BIBLE_GEOGRAPHY_DOCS,
  OPEN_BIBLE_GEOGRAPHY_PHOTOS_URL,
} from "@/lib/study/constants";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ParsedReference } from "@/lib/study/schemas";
import { geographyPlaceSchema } from "@/lib/study/schemas";

type AncientPlaceRecord = {
  friendly_id?: string;
  comment?: string;
  types?: string[];
  translation_name_counts?: Record<string, number>;
  verses?: Array<{
    osis?: string;
    readable?: string;
    sort?: string;
  }>;
  linked_data?: Record<
    string,
    {
      id?: string;
      url?: string;
    }
  >;
  identifications?: Array<{
    resolutions?: Array<{
      lonlat?: string;
      type?: string;
      description?: string;
    }>;
  }>;
  modern_associations?: Record<
    string,
    {
      name?: string;
    }
  >;
};

let ancientPlacesPromise: Promise<AncientPlaceRecord[]> | null = null;
let photoIndexPromise: Promise<Map<string, string>> | null = null;
const photoPagePromiseCache = new Map<string, Promise<{
  pageUrl: string;
  imageUrl: string;
  caption: string;
} | null>>();
const geographyCacheDir = path.join(process.cwd(), ".cache", "openbible");
const geographyCacheFile = path.join(geographyCacheDir, "ancient.jsonl");
const photoIndexCacheFile = path.join(geographyCacheDir, "photos-index.html");

async function readCachedText(filePath: string, maxAgeMs: number) {
  try {
    const fileStat = await stat(filePath);
    const ageMs = Date.now() - fileStat.mtimeMs;

    if (ageMs > maxAgeMs) {
      return null;
    }

    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function writeCachedText(filePath: string, text: string) {
  try {
    await mkdir(geographyCacheDir, { recursive: true });
    await writeFile(filePath, text, "utf8");
  } catch {
    // Best-effort local cache only.
  }
}

async function loadAncientPlacesText() {
  const cached = await readCachedText(
    geographyCacheFile,
    1000 * 60 * 60 * 24 * 30,
  );

  if (cached) {
    return cached;
  }

  const response = await fetch(OPEN_BIBLE_GEOGRAPHY_DATA_URL, {
    signal: AbortSignal.timeout(25_000),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `OpenBible geography dataset failed to load (${response.status}).`,
    );
  }

  const text = await response.text();
  await writeCachedText(geographyCacheFile, text);

  return text;
}

async function loadAncientPlaces() {
  if (!ancientPlacesPromise) {
    ancientPlacesPromise = loadAncientPlacesText()
      .then((text) =>
        text
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line) as AncientPlaceRecord),
      );
  }

  return ancientPlacesPromise;
}

function normalizePlaceName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanOpenBibleText(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function getTranslationNames(place: AncientPlaceRecord) {
  return Object.entries(place.translation_name_counts ?? {})
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([name]) => name);
}

function getIdentificationNotes(place: AncientPlaceRecord) {
  return (
    place.identifications
      ?.flatMap((identification) => identification.resolutions ?? [])
      .map((resolution) => resolution.description)
      .filter((description): description is string => Boolean(description))
      .map(cleanOpenBibleText)
      .filter(Boolean)
      .slice(0, 4) ?? []
  );
}

function getHistoricalNotes(place: AncientPlaceRecord) {
  const notes = [
    place.comment ? cleanOpenBibleText(place.comment) : null,
    ...getIdentificationNotes(place).slice(0, 2),
    ...Object.entries(place.linked_data ?? {})
      .filter(([, value]) => value.url || value.id)
      .slice(0, 3)
      .map(([source]) => `OpenBible links this place to ${source}.`),
  ].filter((note): note is string => Boolean(note));

  return Array.from(new Set(notes)).slice(0, 5);
}

async function loadPhotoIndex() {
  if (!photoIndexPromise) {
    photoIndexPromise = (async () => {
      const cached = await readCachedText(
        photoIndexCacheFile,
        1000 * 60 * 60 * 24 * 30,
      );
      const html =
        cached ??
        (await fetch(OPEN_BIBLE_GEOGRAPHY_PHOTOS_URL, {
          signal: AbortSignal.timeout(20_000),
          cache: "no-store",
        }).then(async (response) => {
          if (!response.ok) {
            throw new Error(
              `OpenBible geography photo index failed to load (${response.status}).`,
            );
          }

          const text = await response.text();
          await writeCachedText(photoIndexCacheFile, text);
          return text;
        }));

      if (!html) {
        return new Map<string, string>();
      }

      const entries = Array.from(
        html.matchAll(/href="(\/geo\/photos\/[^"]+)">([^<]+)<\/a>\s+\(\d+\s+photo/gi),
      );

      return new Map(
        entries.map((match) => [
          normalizePlaceName(match[2]),
          new URL(match[1], OPEN_BIBLE_GEOGRAPHY_DOCS).toString(),
        ]),
      );
    })();
  }

  return photoIndexPromise;
}

async function getPhotoMatchForPlace(placeName: string) {
  const index = await loadPhotoIndex();
  const normalized = normalizePlaceName(placeName);
  const directMatch = index.get(normalized);
  const matchedEntry =
    directMatch ??
    Array.from(index.entries()).find(([name]) => name.startsWith(`${normalized} `))?.[1] ??
    null;

  if (!matchedEntry) {
    return null;
  }

  const cached = photoPagePromiseCache.get(matchedEntry);

  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const response = await fetch(matchedEntry, {
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const imageMatch = html.match(
      /<img[^>]+src="([^"]+)"[^>]+(?:alt|title)="([^"]+)"/i,
    );

    if (!imageMatch) {
      return null;
    }

    return {
      pageUrl: matchedEntry,
      imageUrl: new URL(imageMatch[1], matchedEntry).toString(),
      caption: imageMatch[2],
    };
  })();
  photoPagePromiseCache.set(matchedEntry, promise);

  return promise;
}

export async function getGeographyForChapter(parsedReference: ParsedReference) {
  const osisPrefixes = (parsedReference.chapters ?? [parsedReference.chapter]).map(
    (chapter) => `${parsedReference.bookOsis}.${chapter}.`,
  );
  const matchesPassage = (osis?: string) =>
    osisPrefixes.some((prefix) => osis?.startsWith(prefix));
  const places = await loadAncientPlaces();
  const selected = places
    .filter((place) =>
      place.verses?.some((verse) => matchesPassage(verse.osis)),
    )
    .sort((left, right) => {
      const leftSort = left.verses?.find((verse) =>
        matchesPassage(verse.osis),
      )?.sort;
      const rightSort = right.verses?.find((verse) =>
        matchesPassage(verse.osis),
      )?.sort;

      return (leftSort ?? "").localeCompare(rightSort ?? "");
    });
  const deduped = new Map<string, ReturnType<typeof geographyPlaceSchema.parse>>();

  for (const place of selected) {
    const key = place.friendly_id ?? `place-${deduped.size + 1}`;

    if (deduped.has(key)) {
      continue;
    }

    const matchingVerses =
      place.verses
        ?.filter((verse) => matchesPassage(verse.osis))
        .map((verse) => verse.readable ?? verse.osis ?? "Unknown verse") ?? [];
    const firstResolution = place.identifications?.[0]?.resolutions?.[0];
    const modernAssociation = Object.values(place.modern_associations ?? {})[0]
      ?.name;
    const type = place.types?.[0] ?? firstResolution?.type ?? "place";
    const photoMatch = await getPhotoMatchForPlace(key);
    const translationNames = getTranslationNames(place);
    const identificationNotes = getIdentificationNotes(place);
    const historicalNotes = getHistoricalNotes(place);
    const summaryParts = [
      `${key} is tagged as a ${type}.`,
      modernAssociation
        ? `The strongest modern association is ${modernAssociation}.`
        : undefined,
      matchingVerses.length
        ? `It appears in ${matchingVerses.join(", ")} within this passage.`
        : undefined,
      translationNames.length
        ? `OpenBible records related translation forms: ${translationNames.join(", ")}.`
        : undefined,
    ].filter(Boolean);

    deduped.set(
      key,
      geographyPlaceSchema.parse({
        name: key,
        type,
        summary: summaryParts.join(" "),
        historicalNotes,
        identificationNotes,
        translationNames,
        modernAssociation,
        coordinates: firstResolution?.lonlat,
        mentionedVerses: matchingVerses,
        sourceUrl: OPEN_BIBLE_GEOGRAPHY_DOCS,
        photoMatch: photoMatch ?? undefined,
      }),
    );
  }

  return Array.from(deduped.values()).slice(0, 8);
}
