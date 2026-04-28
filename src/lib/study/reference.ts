import { bcv_parser } from "bible-passage-reference-parser/esm/bcv_parser.js";
import * as lang from "bible-passage-reference-parser/esm/lang/en.js";
import { getBookChapterCount } from "@/lib/study/book-chapters";
import { getBookMetadata } from "@/lib/study/book-metadata";
import { MAX_STUDY_CHAPTER_RANGE } from "@/lib/study/constants";
import {
  parsedReferenceSchema,
  type ParsedReference,
} from "@/lib/study/schemas";

function parseOsisChapter(value: string) {
  const parts = value.split(".");

  if (parts.length !== 2) {
    throw new Error(
      'Use whole chapter references like "Romans 8" or "John 3-4".',
    );
  }

  const [bookOsis, chapterText] = parts;
  const chapter = Number(chapterText);

  if (!Number.isInteger(chapter) || chapter <= 0) {
    throw new Error("The chapter number is invalid.");
  }

  return { bookOsis, chapter };
}

export function parseChapterReference(rawReference: string): ParsedReference {
  const parser = new bcv_parser(lang);
  const reference = rawReference.trim();
  const osis = parser.parse(reference).osis();

  if (!osis) {
    throw new Error(
      `Couldn't parse "${reference}". Use a chapter reference like "John 3" or "Genesis 1-2".`,
    );
  }

  if (osis.includes(",")) {
    throw new Error("Choose one continuous chapter range rather than a list.");
  }

  const [startOsis, endOsis] = osis.includes("-")
    ? osis.split("-")
    : [osis, osis];
  const start = parseOsisChapter(startOsis);
  const end = parseOsisChapter(endOsis);

  if (start.bookOsis !== end.bookOsis) {
    throw new Error(
      "Choose a chapter range within a single book.",
    );
  }

  if (end.chapter < start.chapter) {
    throw new Error("The ending chapter must be after the starting chapter.");
  }

  const book = getBookMetadata(start.bookOsis);
  const chapterCount = getBookChapterCount(start.bookOsis);

  if (end.chapter > chapterCount) {
    throw new Error(
      `${book.name} has ${chapterCount} chapter${chapterCount === 1 ? "" : "s"}.`,
    );
  }

  const chapterRangeLength = end.chapter - start.chapter + 1;

  if (chapterRangeLength > MAX_STUDY_CHAPTER_RANGE) {
    throw new Error(
      `Choose ${MAX_STUDY_CHAPTER_RANGE} chapters or fewer for one study run.`,
    );
  }

  const chapters = Array.from(
    { length: chapterRangeLength },
    (_, index) => start.chapter + index,
  );
  const normalizedOsis =
    start.chapter === end.chapter
      ? `${start.bookOsis}.${start.chapter}`
      : `${start.bookOsis}.${start.chapter}-${end.bookOsis}.${end.chapter}`;
  const normalizedReference =
    start.chapter === end.chapter
      ? `${book.name} ${start.chapter}`
      : `${book.name} ${start.chapter}-${end.chapter}`;

  return parsedReferenceSchema.parse({
    reference: normalizedReference,
    osis: normalizedOsis,
    bookOsis: start.bookOsis,
    startChapter: start.chapter,
    endChapter: end.chapter,
    chapters,
    chapter: start.chapter,
    book,
  });
}
