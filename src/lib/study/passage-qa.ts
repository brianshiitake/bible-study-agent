import { randomUUID } from "node:crypto";
import { createAgent } from "langchain";
import { ensureDatabaseSchema, getSql } from "@/lib/db";
import { createOpenRouterModel } from "@/lib/study/models";
import { getStudyRunById } from "@/lib/study/persistence";
import {
  passageQuestionAnswerSchema,
  persistedPassageQuestionSchema,
  type PassageQuestionRequest,
  type PersistedPassageQuestion,
} from "@/lib/study/schemas";

function formatPrimaryChapterText(studyId: string, version: {
  versionId: string;
  versionLabel: string;
  verses: Array<{ verse: string; text: string }>;
}) {
  void studyId;

  return [
    `Version: ${version.versionLabel} (${version.versionId})`,
    ...version.verses.map((verse) => `${verse.verse}. ${verse.text}`),
  ].join("\n");
}

function formatRelatedContext(study: NonNullable<Awaited<ReturnType<typeof getStudyRunById>>>) {
  if (!study.context.relatedChapters.length) {
    return "No adjacent chapter context was stored for this study.";
  }

  return study.context.relatedChapters
    .map(
      (chapter) =>
        `${chapter.reference} (${chapter.relation})\n${chapter.summary}`,
    )
    .join("\n\n");
}

async function findExistingPassageQuestion(
  input: PassageQuestionRequest,
): Promise<PersistedPassageQuestion | null> {
  await ensureDatabaseSchema();
  const sql = getSql();
  const rows = await sql<
    Array<{
      id: string;
      study_id: string;
      reference: string;
      version_id: string;
      selection_text: string;
      question: string;
      answer: string;
      surrounding_context: string;
      confidence: "low" | "medium" | "high";
      created_at: string | Date;
    }>
  >`
    select
      id,
      study_id,
      reference,
      version_id,
      selection_text,
      question,
      answer,
      surrounding_context,
      confidence,
      created_at
    from study_passage_questions
    where
      study_id = ${input.studyId}
      and version_id = ${input.versionId}
      and selection_text = ${input.selectionText}
      and question = ${input.question}
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    return null;
  }

  return persistedPassageQuestionSchema.parse({
    id: row.id,
    studyId: row.study_id,
    reference: row.reference,
    versionId: row.version_id,
    selectionText: row.selection_text,
    question: row.question,
    answer: row.answer,
    surroundingContext: row.surrounding_context,
    confidence: row.confidence,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
  });
}

export async function listStudyPassageQuestions(studyId: string) {
  await ensureDatabaseSchema();
  const sql = getSql();
  const rows = await sql<
    Array<{
      id: string;
      study_id: string;
      reference: string;
      version_id: string;
      selection_text: string;
      question: string;
      answer: string;
      surrounding_context: string;
      confidence: "low" | "medium" | "high";
      created_at: string | Date;
    }>
  >`
    select
      id,
      study_id,
      reference,
      version_id,
      selection_text,
      question,
      answer,
      surrounding_context,
      confidence,
      created_at
    from study_passage_questions
    where study_id = ${studyId}
    order by created_at desc
  `;

  return rows.map((row) =>
    persistedPassageQuestionSchema.parse({
      id: row.id,
      studyId: row.study_id,
      reference: row.reference,
      versionId: row.version_id,
      selectionText: row.selection_text,
      question: row.question,
      answer: row.answer,
      surroundingContext: row.surrounding_context,
      confidence: row.confidence,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : row.created_at,
    }),
  );
}

export async function answerPassageQuestion(input: PassageQuestionRequest) {
  const existing = await findExistingPassageQuestion(input);

  if (existing) {
    return existing;
  }

  const study = await getStudyRunById(input.studyId);

  if (!study) {
    throw new Error("The requested study could not be found.");
  }

  const selectedVersion = study.context.versions.find(
    (version) => version.versionId === input.versionId,
  );

  if (!selectedVersion) {
    throw new Error(`Version "${input.versionId}" is not part of this study.`);
  }

  const agent = createAgent({
    model: createOpenRouterModel("openai/gpt-5.5"),
    responseFormat: passageQuestionAnswerSchema as never,
    systemPrompt: [
      "You answer questions about a selected portion of a Bible passage.",
      "Use the selected text first, but explain it in light of the entire passage and the adjacent chapters provided.",
      "Keep the answer clear, pastoral, and textually grounded.",
      "Do not claim hidden certainty. Distinguish observation from inference where necessary.",
      "Return concise but substantial explanations that help a learner understand the selected section.",
    ].join("\n"),
  });
  const result = await agent.invoke({
    messages: [
      {
        role: "user",
        content: [
          `Study reference: ${study.context.parsedReference.reference}`,
          `Selected version: ${selectedVersion.versionLabel} (${selectedVersion.versionId})`,
          `Selected text: ${input.selectionText}`,
          `User question: ${input.question}`,
          "",
          "Entire passage:",
          formatPrimaryChapterText(study.id, selectedVersion),
          "",
          "Adjacent chapter context:",
          formatRelatedContext(study),
          "",
          "Final study thesis:",
          study.finalSynthesis.thesis,
        ].join("\n"),
      },
    ],
  });

  const structured = passageQuestionAnswerSchema.parse(result.structuredResponse);
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  await ensureDatabaseSchema();
  const sql = getSql();
  await sql`
    insert into study_passage_questions (
      id,
      study_id,
      reference,
      version_id,
      selection_text,
      question,
      answer,
      surrounding_context,
      confidence,
      created_at
    ) values (
      ${id},
      ${study.id},
      ${study.context.parsedReference.reference},
      ${input.versionId},
      ${input.selectionText},
      ${input.question},
      ${structured.answer},
      ${structured.surroundingContext},
      ${structured.confidence},
      ${createdAt}
    )
  `;

  return persistedPassageQuestionSchema.parse({
    id,
    studyId: study.id,
    reference: study.context.parsedReference.reference,
    versionId: input.versionId,
    selectionText: input.selectionText,
    question: input.question,
    answer: structured.answer,
    surroundingContext: structured.surroundingContext,
    confidence: structured.confidence,
    createdAt,
  });
}
