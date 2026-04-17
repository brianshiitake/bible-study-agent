import { z } from "zod";
import { DEFAULT_VERSION_IDS } from "@/lib/study/constants";

export const studyRequestSchema = z.object({
  reference: z.string().trim().min(1, "Reference is required."),
  versions: z.array(z.string().trim().min(1)).min(2).max(6).optional(),
  focusQuestion: z
    .string()
    .trim()
    .max(500, "Focus question is too long.")
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export const normalizedStudyRequestSchema = studyRequestSchema.extend({
  versions: z.array(z.string().trim().min(1)).min(2).max(6),
});

export type StudyRequest = z.infer<typeof studyRequestSchema>;
export type NormalizedStudyRequest = z.infer<typeof normalizedStudyRequestSchema>;

export function normalizeStudyRequest(
  input: StudyRequest,
): NormalizedStudyRequest {
  return normalizedStudyRequestSchema.parse({
    ...input,
    versions: Array.from(new Set(input.versions ?? DEFAULT_VERSION_IDS)),
  });
}

export const bookContextSchema = z.object({
  osis: z.string(),
  name: z.string(),
  apiSlug: z.string(),
  testament: z.enum(["Old Testament", "New Testament"]),
  genre: z.string(),
  compositionWindow: z.string(),
  setting: z.string(),
  summary: z.string(),
});

export const parsedReferenceSchema = z.object({
  reference: z.string(),
  osis: z.string(),
  bookOsis: z.string(),
  chapter: z.number().int().positive(),
  book: bookContextSchema,
});

export type ParsedReference = z.infer<typeof parsedReferenceSchema>;
export type BookContext = z.infer<typeof bookContextSchema>;

export const versionMetadataSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  language: z.string(),
  scope: z.string(),
  copyright: z.string(),
  sourceUrl: z.string().url(),
});

export const verseSchema = z.object({
  verse: z.string(),
  text: z.string(),
});

export const chapterTextSchema = z.object({
  versionId: z.string(),
  versionLabel: z.string(),
  description: z.string(),
  language: z.string(),
  scope: z.string(),
  attribution: z.string(),
  sourceUrl: z.string().url(),
  verses: z.array(verseSchema).min(1),
});

export const photoMatchSchema = z.object({
  pageUrl: z.string().url(),
  imageUrl: z.string().url(),
  caption: z.string(),
});

export const relatedChapterSchema = z.object({
  reference: z.string(),
  relation: z.enum(["previous", "next"]),
  versionId: z.string(),
  versionLabel: z.string(),
  summary: z.string(),
  verses: z.array(verseSchema).min(1),
});

export const geographyPlaceSchema = z.object({
  name: z.string(),
  type: z.string(),
  summary: z.string(),
  modernAssociation: z.string().optional(),
  coordinates: z.string().optional(),
  mentionedVerses: z.array(z.string()),
  sourceUrl: z.string().url(),
  photoMatch: photoMatchSchema.optional(),
});

export const studyNoteSchema = z.object({
  title: z.string(),
  body: z.string(),
  sourceUrl: z.string().url().optional(),
});

export const sourceStatusSchema = z.enum(["active", "fallback", "inactive"]);

export const sourceCatalogEntrySchema = z.object({
  label: z.string(),
  url: z.string().url(),
  status: sourceStatusSchema,
  note: z.string(),
});

export const studyContextSchema = z.object({
  parsedReference: parsedReferenceSchema,
  versions: z.array(chapterTextSchema).min(1),
  relatedChapters: z.array(relatedChapterSchema),
  geography: z.array(geographyPlaceSchema),
  studyNotes: z.array(studyNoteSchema),
  sourceDiagnostics: z.array(z.string()),
  sourceCatalog: z.array(sourceCatalogEntrySchema),
});

export type StudyContext = z.infer<typeof studyContextSchema>;

export const confidenceSchema = z.enum(["low", "medium", "high"]);

export const crossReferenceSchema = z.object({
  reference: z.string(),
  relevance: z.string(),
});

export const translationInsightSchema = z.object({
  verseRange: z.string(),
  versions: z.array(z.string()).min(2),
  observation: z.string(),
  significance: z.string(),
});

export const analystPayloadSchema = z.object({
  thesis: z.string(),
  chapterMovement: z.array(z.string()).min(2).max(8),
  historicalContext: z.string(),
  chronologyInsight: z.string(),
  geographyInsight: z.string(),
  translationInsights: z.array(translationInsightSchema).min(1).max(6),
  crossReferences: z.array(crossReferenceSchema).min(3).max(8),
  keyThemes: z.array(z.string()).min(3).max(8),
  meaning: z.string(),
  livedResponse: z.array(z.string()).min(2).max(6),
  cautions: z.array(z.string()).min(1).max(4),
  confidence: confidenceSchema,
  sourcesUsed: z.array(z.string()).min(1),
});

export const analystReportSchema = analystPayloadSchema.extend({
  modelId: z.string(),
  modelLabel: z.string(),
  lens: z.string(),
});

export type AnalystPayload = z.infer<typeof analystPayloadSchema>;
export type AnalystReport = z.infer<typeof analystReportSchema>;

export const finalSynthesisSchema = z.object({
  thesis: z.string(),
  consensus: z.array(z.string()).min(3).max(8),
  productiveDifferences: z.array(z.string()).min(1).max(4),
  historicalSnapshot: z.string(),
  geographicSnapshot: z.string(),
  translationSnapshot: z.string(),
  canonicalLinks: z.array(crossReferenceSchema).min(3).max(8),
  practicalTakeaways: z.array(z.string()).min(3).max(6),
  pronunciationGuide: z.array(
    z.object({
      term: z.string(),
      phonetic: z.string(),
      type: z.enum(["name", "place", "term"]),
      explanation: z.string(),
    }),
  ).min(1).max(8),
  prayerPrompt: z.string(),
  openQuestions: z.array(z.string()).min(1).max(4),
  confidence: confidenceSchema,
  sourcesUsed: z.array(z.string()).min(1),
});

export type FinalSynthesis = z.infer<typeof finalSynthesisSchema>;

export const studyVoiceNarrationSchema = z.object({
  provider: z.literal("fal"),
  model: z.string(),
  voice: z.string(),
  languageCode: z.string(),
  format: z.enum(["wav", "mp3", "ogg_opus"]),
  text: z.string(),
  audioUrl: z.string().url(),
});

export type StudyVoiceNarration = z.infer<typeof studyVoiceNarrationSchema>;

export const studyResultSchema = z.object({
  request: normalizedStudyRequestSchema,
  context: studyContextSchema,
  reports: z.array(analystReportSchema).min(1),
  finalSynthesis: finalSynthesisSchema,
  voiceNarration: studyVoiceNarrationSchema.nullable().default(null),
  generatedAt: z.string(),
  warnings: z.array(z.string()),
});

export type StudyResult = z.infer<typeof studyResultSchema>;

export const persistedStudyResultSchema = studyResultSchema.extend({
  id: z.string().uuid(),
  slug: z.string(),
});

export type PersistedStudyResult = z.infer<typeof persistedStudyResultSchema>;

export const studyRunSummarySchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  reference: z.string(),
  focusQuestion: z.string().optional(),
  createdAt: z.string(),
  versionIds: z.array(z.string()),
  finalThesis: z.string(),
  confidence: confidenceSchema,
});

export type StudyRunSummary = z.infer<typeof studyRunSummarySchema>;

export const passageQuestionRequestSchema = z.object({
  studyId: z.string().uuid(),
  versionId: z.string().trim().min(1),
  selectionText: z.string().trim().min(1).max(2400),
  question: z.string().trim().min(1).max(500),
});

export const passageQuestionAnswerSchema = z.object({
  answer: z.string(),
  surroundingContext: z.string(),
  confidence: confidenceSchema,
});

export const persistedPassageQuestionSchema = passageQuestionRequestSchema
  .extend({
    id: z.string().uuid(),
    reference: z.string(),
    createdAt: z.string(),
  })
  .merge(passageQuestionAnswerSchema);

export type PassageQuestionRequest = z.infer<typeof passageQuestionRequestSchema>;
export type PassageQuestionAnswer = z.infer<typeof passageQuestionAnswerSchema>;
export type PersistedPassageQuestion = z.infer<typeof persistedPassageQuestionSchema>;
