import { bcv_parser } from "bible-passage-reference-parser/esm/bcv_parser.js";
import * as lang from "bible-passage-reference-parser/esm/lang/en.js";
import { getBookChapterCount } from "@/lib/study/book-chapters";
import { getBookMetadata } from "@/lib/study/book-metadata";
import {
  parsedReferenceSchema,
  type ParsedReference,
} from "@/lib/study/schemas";

export function parseChapterReference(rawReference: string): ParsedReference {
  const parser = new bcv_parser(lang);
  const reference = rawReference.trim();
  const osis = parser.parse(reference).osis();

  if (!osis) {
    throw new Error(
      `Couldn't parse "${reference}". Use a chapter reference like "John 3" or "Genesis 1".`,
    );
  }

  if (osis.includes(",") || osis.includes("-")) {
    throw new Error("Choose a single chapter rather than a range or list.");
  }

  const parts = osis.split(".");

  if (parts.length !== 2) {
    throw new Error(
      'Choose a chapter reference like "Romans 8" or "Genesis 1".',
    );
  }

  const [bookOsis, chapterText] = parts;
  const chapter = Number(chapterText);

  if (!Number.isInteger(chapter) || chapter <= 0) {
    throw new Error("The chapter number is invalid.");
  }

  const book = getBookMetadata(bookOsis);
  const chapterCount = getBookChapterCount(bookOsis);

  if (chapter > chapterCount) {
    throw new Error(
      `${book.name} has ${chapterCount} chapter${chapterCount === 1 ? "" : "s"}.`,
    );
  }

  return parsedReferenceSchema.parse({
    reference: `${book.name} ${chapter}`,
    osis,
    bookOsis,
    chapter,
    book,
  });
}
