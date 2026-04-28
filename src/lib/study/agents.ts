import { tool, createAgent } from "langchain";
import { z } from "zod";
import {
  createTimestamp,
  type StudyRunEventHandler,
} from "@/lib/study/events";
import {
  analystPayloadSchema,
  analystReportSchema,
  finalSynthesisSchema,
  type AnalystReport,
  type FinalSynthesis,
  type NormalizedStudyRequest,
  type StudyContext,
} from "@/lib/study/schemas";
import {
  createOpenRouterModel,
  getSynthesizerModel,
  type StudyModelConfig,
} from "@/lib/study/models";

const contextFocusSchema = z.object({
  focus: z
    .enum([
      "full",
      "translations",
      "history",
      "related",
      "geography",
      "crossReferences",
      "notes",
      "sources",
    ])
    .default("full"),
});

function formatTranslations(context: StudyContext) {
  return context.versions
    .map(
      (version) =>
        `Version: ${version.versionLabel} (${version.versionId})\nDescription: ${version.description}\nAttribution: ${version.attribution}\n${version.verses
          .map((verse) => `${verse.verse}. ${verse.text}`)
          .join("\n")}`,
    )
    .join("\n\n---\n\n");
}

function formatHistory(context: StudyContext) {
  const book = context.parsedReference.book;
  const openBibleHistory = context.geography
    .filter(
      (place) =>
        place.historicalNotes.length ||
        place.identificationNotes.length ||
        place.translationNames.length,
    )
    .map((place) =>
      [
        `${place.name}: ${place.summary}`,
        place.historicalNotes.length
          ? `Historical notes: ${place.historicalNotes.join(" ")}`
          : null,
        place.identificationNotes.length
          ? `Identification notes: ${place.identificationNotes.join(" ")}`
          : null,
        place.translationNames.length
          ? `Translation forms: ${place.translationNames.join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );

  return [
    `Reference: ${context.parsedReference.reference}`,
    `Book: ${book.name}`,
    `Genre: ${book.genre}`,
    `Composition window: ${book.compositionWindow}`,
    `Setting: ${book.setting}`,
    `Summary: ${book.summary}`,
    "",
    "OpenBible place history:",
    openBibleHistory.length
      ? openBibleHistory.join("\n\n")
      : "No OpenBible place-history notes were available for this passage.",
  ].join("\n");
}

function formatRelatedChapters(context: StudyContext) {
  if (!context.relatedChapters.length) {
    return "No adjacent chapter context was available for this request.";
  }

  return context.relatedChapters
    .map(
      (chapter) =>
        `Relation: ${chapter.relation}\nReference: ${chapter.reference}\nVersion: ${chapter.versionLabel} (${chapter.versionId})\nSummary: ${chapter.summary}\n${chapter.verses
          .map((verse) => `${verse.verse}. ${verse.text}`)
          .join("\n")}`,
    )
    .join("\n\n---\n\n");
}

function formatGeography(context: StudyContext) {
  if (!context.geography.length) {
    return "No explicit geography entries were matched for this passage.";
  }

  return context.geography
    .map(
      (place) =>
        `${place.name} (${place.type})\nSummary: ${place.summary}\nVerses: ${place.mentionedVerses.join(", ")}\nCoordinates: ${place.coordinates ?? "Unknown"}\nHistorical notes: ${
          place.historicalNotes.length
            ? place.historicalNotes.join(" ")
            : "None supplied."
        }`,
    )
    .join("\n\n");
}

function formatOpenBibleCrossReferences(context: StudyContext) {
  if (!context.openBibleCrossReferences.length) {
    return "No OpenBible cross-reference candidates were available for this passage.";
  }

  return context.openBibleCrossReferences
    .map(
      (group) =>
        `${group.sourceVerse}\n${group.references
          .map((entry) => `- ${entry.reference}`)
          .join("\n")}`,
    )
    .join("\n\n");
}

function formatNotes(context: StudyContext) {
  if (!context.studyNotes.length) {
    return "No supplemental study-note adapter returned notes for this passage.";
  }

  return context.studyNotes
    .map((note) => `${note.title}\n${note.body}`)
    .join("\n\n");
}

function formatSources(context: StudyContext) {
  return [
    "Source diagnostics:",
    ...context.sourceDiagnostics.map((entry) => `- ${entry}`),
    "",
    "Source catalog:",
    ...context.sourceCatalog.map(
      (entry) => `- ${entry.label} [${entry.status}]: ${entry.note} (${entry.url})`,
    ),
  ].join("\n");
}

function createStudyContextTool(context: StudyContext) {
  return tool(
    async ({ focus }) => {
      switch (focus) {
        case "translations":
          return formatTranslations(context);
        case "history":
          return formatHistory(context);
        case "related":
          return formatRelatedChapters(context);
        case "geography":
          return formatGeography(context);
        case "crossReferences":
          return formatOpenBibleCrossReferences(context);
        case "notes":
          return formatNotes(context);
        case "sources":
          return formatSources(context);
        case "full":
        default:
          return [
            "TRANSLATIONS",
            formatTranslations(context),
            "",
            "HISTORY",
            formatHistory(context),
            "",
            "RELATED CHAPTERS",
            formatRelatedChapters(context),
            "",
            "GEOGRAPHY",
            formatGeography(context),
            "",
            "OPENBIBLE CROSS REFERENCES",
            formatOpenBibleCrossReferences(context),
            "",
            "NOTES",
            formatNotes(context),
            "",
            "SOURCES",
            formatSources(context),
          ].join("\n");
      }
    },
    {
      name: "read_study_context",
      description:
        "Read the prepared study bundle, including passage text comparisons, chronology, geography, notes, and source diagnostics.",
      schema: contextFocusSchema,
    },
  );
}

function createAgentReportsTool(reports: AnalystReport[]) {
  return tool(
    async () =>
      JSON.stringify(
        reports.map((report) => ({
          model: report.modelLabel,
          lens: report.lens,
          thesis: report.thesis,
          chapterMovement: report.chapterMovement,
          historicalContext: report.historicalContext,
          chronologyInsight: report.chronologyInsight,
          geographyInsight: report.geographyInsight,
          translationInsights: report.translationInsights,
          crossReferences: report.crossReferences,
          keyThemes: report.keyThemes,
          meaning: report.meaning,
          livedResponse: report.livedResponse,
          cautions: report.cautions,
          confidence: report.confidence,
        })),
        null,
        2,
      ),
    {
      name: "read_agent_reports",
      description:
        "Read the structured outputs from all completed analyst agents before producing the final synthesis.",
      schema: z.object({}),
    },
  );
}

function buildAnalystPrompt(
  modelConfig: StudyModelConfig,
  input: NormalizedStudyRequest,
) {
  return [
    "You are one analyst in a multi-model Bible study workflow.",
    `Your primary lens is: ${modelConfig.lens}`,
    `Study the passage ${input.reference}.`,
    input.focusQuestion
      ? `The user's focus question is: ${input.focusQuestion}`
      : "No extra focus question was supplied.",
    "Before you answer, read the full passage bundle carefully and make sure your reasoning reflects the whole selected passage rather than isolated verses.",
    "Also read the adjacent chapter context so the passage is interpreted in its immediate literary flow.",
    "Call read_study_context at least five times, including translations, related, history, geography, and crossReferences.",
    "Work from the provided sources first, then make careful inferences where needed.",
    "Distinguish between explicit textual observation and interpretive judgment.",
    "Use canonical cross-references that genuinely illuminate the passage; do the extra work to include 8-12 specific biblical references when the text supports them.",
    "Use OpenBible cross-reference candidates as leads, but filter them for genuine relevance and explain the specific connection.",
    "Keep your output substantive but concise. Fill every schema field.",
  ].join("\n");
}

async function emitStatus(
  onEvent: StudyRunEventHandler | undefined,
  target: string,
  label: string,
  stage: "running" | "completed" | "failed",
  message: string,
) {
  await onEvent?.({
    type: "status",
    target,
    label,
    stage,
    message,
    timestamp: createTimestamp(),
  });
}

async function emitLog(
  onEvent: StudyRunEventHandler | undefined,
  scope: "agent" | "synthesis",
  target: string,
  label: string,
  message: string,
) {
  await onEvent?.({
    type: "log",
    scope,
    target,
    label,
    message,
    timestamp: createTimestamp(),
  });
}

const ANALYST_SKIP_MESSAGE = "Model output malformed.. skipping.";

function buildFailureReport(
  modelConfig: StudyModelConfig,
  message: string,
): AnalystReport {
  return analystReportSchema.parse({
    modelId: modelConfig.id,
    modelLabel: modelConfig.label,
    lens: modelConfig.lens,
    thesis: `${modelConfig.label} did not complete analysis.`,
    chapterMovement: [
      "The analysis request failed before a structured report could be returned.",
      "Use the other analyst reports and retry this model once the error is resolved.",
    ],
    historicalContext:
      "Historical analysis unavailable because this model call failed.",
    chronologyInsight:
      "Chronological insight unavailable because this model call failed.",
    geographyInsight:
      "Geographic insight unavailable because this model call failed.",
    translationInsights: [
      {
        verseRange: "Unavailable",
        versions: ["Unavailable", "Unavailable"],
        observation: "This analyst did not return translation comparison data.",
        significance: ANALYST_SKIP_MESSAGE,
      },
    ],
    crossReferences: [
      {
        reference: "Retry required",
        relevance: ANALYST_SKIP_MESSAGE,
      },
      {
        reference: "Fallback to remaining analysts",
        relevance: "The synthesis can still proceed with surviving reports.",
      },
      {
        reference: "Operational warning",
        relevance: "Investigate the failing provider or model configuration.",
      },
      {
        reference: "OpenBible context unavailable",
        relevance: "This failed analyst did not inspect OpenBible references.",
      },
      {
        reference: "Passage context unavailable",
        relevance: "This failed analyst did not compare the surrounding passage.",
      },
      {
        reference: "Canonical synthesis required",
        relevance: "Use completed analyst reports to recover biblical links.",
      },
    ],
    keyThemes: ["Analysis unavailable", "Retry needed", "Use remaining reports"],
    meaning:
      "No interpretation was generated because this analyst request failed.",
    livedResponse: [
      "Review the other model outputs first.",
      "Retry the failed model once the configuration issue is resolved.",
    ],
    cautions: [`${ANALYST_SKIP_MESSAGE} ${message}`],
    confidence: "low",
    sourcesUsed: ["Runtime failure placeholder"],
  });
}

export async function runAnalystAgent(
  modelConfig: StudyModelConfig,
  context: StudyContext,
  input: NormalizedStudyRequest,
  options: {
    onEvent?: StudyRunEventHandler;
  } = {},
) {
  try {
    await emitStatus(
      options.onEvent,
      modelConfig.id,
      modelConfig.label,
      "running",
      "Preparing passage bundle and model invocation.",
    );
    await emitLog(
      options.onEvent,
      "agent",
      modelConfig.id,
      modelConfig.label,
      "Reading full passage translations, adjacent chapters, and contextual sources.",
    );
    const agent = createAgent({
      model: createOpenRouterModel(modelConfig.model),
      tools: [createStudyContextTool(context)],
      responseFormat: analystPayloadSchema as never,
      systemPrompt: buildAnalystPrompt(modelConfig, input),
    });
    const result = await agent.invoke({
      messages: [
        {
          role: "user",
          content: `Produce a structured study for ${context.parsedReference.reference}.`,
        },
      ],
    });

    const report = analystReportSchema.parse({
      modelId: modelConfig.id,
      modelLabel: modelConfig.label,
      lens: modelConfig.lens,
      ...result.structuredResponse,
    });
    await emitLog(
      options.onEvent,
      "agent",
      modelConfig.id,
      modelConfig.label,
      `Completed structured analysis with ${report.crossReferences.length} cross references and ${report.translationInsights.length} translation comparisons.`,
    );
    await emitStatus(
      options.onEvent,
      modelConfig.id,
      modelConfig.label,
      "completed",
      report.confidence === "low"
        ? "Completed with low confidence."
        : "Completed successfully.",
    );

    return report;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown analyst failure.";
    await emitStatus(
      options.onEvent,
      modelConfig.id,
      modelConfig.label,
      "failed",
      ANALYST_SKIP_MESSAGE,
    );

    return buildFailureReport(modelConfig, message);
  }
}

function buildSynthesisPrompt(input: NormalizedStudyRequest) {
  return [
    "You are the final synthesis agent for a Bible study dashboard.",
    `Digest the four analyst reports for ${input.reference}.`,
    input.focusQuestion
      ? `Keep the user's focus question central: ${input.focusQuestion}`
      : "No extra focus question was supplied.",
    "Read the analyst reports first, then reconcile their overlap and differences.",
    "Preserve meaningful tension where the analysts disagree rather than flattening everything.",
    "Anchor the synthesis in the supplied context, especially the full passage, adjacent chapters, translation comparisons, OpenBible context, and canonical links.",
    "Include a pronunciation guide for difficult names, places, or terms from this passage and its setting.",
    "Build a verse-by-verse breakdown for every verse in the selected passage. For each verse, explain the verse's plain meaning, what is happening to Jesus or how the verse relates to Jesus and the gospel, and the verse's significance or undertones in the larger context.",
    "For Gospel passages, be concrete about what is happening to Jesus in the narrative. For non-Gospel passages, avoid forced claims and explain the redemptive-historical or canonical connection where appropriate.",
    "Include 8-14 canonical links in the synthesis when the analyst reports and OpenBible candidates support them.",
    "Keep the final result clear enough for a dashboard viewer to understand quickly.",
  ].join("\n");
}

function fallbackSynthesis(reports: AnalystReport[], context: StudyContext): FinalSynthesis {
  const topThemes = Array.from(
    new Set(reports.flatMap((report) => report.keyThemes)),
  ).slice(0, 6);
  const firstCrossReferences = Array.from(
    new Map(
      reports
        .flatMap((report) => report.crossReferences)
        .map((entry) => [entry.reference, entry]),
    ).values(),
  ).slice(0, 16);
  const fallbackCanonicalLinks = [
    ...firstCrossReferences,
    {
      reference: context.parsedReference.reference,
      relevance: "Fallback synthesis could not gather richer cross-reference data.",
    },
    {
      reference: "OpenBible cross references",
      relevance: "Review the OpenBible context pack for candidate biblical links.",
    },
    {
      reference: "Analyst reports",
      relevance: "Use the per-model cards directly until the retry succeeds.",
    },
    {
      reference: "Retry advised",
      relevance: "The final synthesis model failed and fell back to deterministic merge.",
    },
    {
      reference: "Selected passage",
      relevance: "The passage text remains the primary control for interpretation.",
    },
    {
      reference: "Adjacent chapters",
      relevance: "Immediate literary context still frames the selected passage.",
    },
  ].slice(0, 16);
  const verseBreakdown = (context.versions[0]?.verses ?? []).map((verse) => ({
    verse: verse.verse,
    meaning:
      "Fallback mode could not generate a full line-by-line interpretation for this verse.",
    jesusContext:
      "Review the completed analyst reports and rerun the synthesis for a fuller Jesus-centered reading.",
    significance:
      "This verse remains part of the selected passage's flow and should be read with the surrounding verses.",
    crossReferences: fallbackCanonicalLinks.slice(0, 1),
  }));
  const safeVerseBreakdown = verseBreakdown.length
    ? verseBreakdown
    : [
        {
          verse: context.parsedReference.reference,
          meaning:
            "Fallback mode could not generate verse-level interpretation.",
          jesusContext:
            "Rerun the synthesis for a fuller Jesus-centered reading.",
          significance:
            "Use the selected passage and analyst reports until the synthesis can be retried.",
          crossReferences: fallbackCanonicalLinks.slice(0, 1),
        },
      ];
  const pronunciationGuide = (
    context.geography.length
      ? context.geography.slice(0, 4).map((place) => ({
          term: place.name,
          phonetic: place.name,
          type: "place" as const,
          explanation: place.summary,
        }))
      : [
          {
            term: context.parsedReference.book.name,
            phonetic: context.parsedReference.book.name,
            type: "term" as const,
            explanation:
              "Fallback pronunciation guidance was generated because the synthesis model did not complete.",
          },
        ]
  ).slice(0, 8);

  return finalSynthesisSchema.parse({
    thesis:
      reports[0]?.thesis ??
      `A fallback synthesis was generated for ${context.parsedReference.reference}.`,
    consensus: topThemes.length
      ? topThemes
      : ["A retry is recommended before relying on this synthesis."],
    productiveDifferences: reports
      .map((report) => `${report.modelLabel}: ${report.cautions[0] ?? report.thesis}`)
      .slice(0, 4),
    historicalSnapshot: reports[0]?.historicalContext ?? "Unavailable.",
    geographicSnapshot:
      reports[0]?.geographyInsight ??
      "Geographic synthesis unavailable in fallback mode.",
    translationSnapshot:
      reports[0]?.translationInsights[0]?.observation ??
      "Translation comparison unavailable in fallback mode.",
    canonicalLinks: fallbackCanonicalLinks.slice(0, Math.max(6, fallbackCanonicalLinks.length)),
    verseBreakdown: safeVerseBreakdown,
    practicalTakeaways: Array.from(
      new Set(reports.flatMap((report) => report.livedResponse)),
    ).slice(0, 6),
    pronunciationGuide,
    prayerPrompt: `Lord, give clarity, humility, and obedience as this passage is studied in community.`,
    openQuestions: [
      "Which analyst disagreements should be reviewed manually?",
      "Would a second pass with licensed Bible/commentary APIs improve the synthesis?",
    ],
    confidence: reports.some((report) => report.confidence === "low")
      ? "low"
      : "medium",
    sourcesUsed: ["Fallback synthesis from analyst reports only"],
  });
}

export async function runFinalSynthesisAgent(
  context: StudyContext,
  reports: AnalystReport[],
  input: NormalizedStudyRequest,
  options: {
    onEvent?: StudyRunEventHandler;
  } = {},
) {
  try {
    await emitStatus(
      options.onEvent,
      "synthesis",
      "Final Synthesis",
      "running",
      "Reconciling analyst reports into one result.",
    );
    await emitLog(
      options.onEvent,
      "synthesis",
      "synthesis",
      "Final Synthesis",
      "Reading analyst reports, translation differences, OpenBible context, and adjacent chapter context.",
    );
    const synthesisModel = getSynthesizerModel();
    const agent = createAgent({
      model: createOpenRouterModel(synthesisModel.model),
      tools: [createStudyContextTool(context), createAgentReportsTool(reports)],
      responseFormat: finalSynthesisSchema as never,
      systemPrompt: buildSynthesisPrompt(input),
    });
    const result = await agent.invoke({
      messages: [
        {
          role: "user",
          content:
            "Produce the final synthesis. Read the analyst reports and any supporting context you need first.",
        },
      ],
    });

    const synthesis = finalSynthesisSchema.parse(result.structuredResponse);
    await emitStatus(
      options.onEvent,
      "synthesis",
      "Final Synthesis",
      "completed",
      "Final synthesis completed.",
    );

    return synthesis;
  } catch {
    await emitStatus(
      options.onEvent,
      "synthesis",
      "Final Synthesis",
      "failed",
      "The synthesis model failed; falling back to deterministic merge.",
    );
    return fallbackSynthesis(reports, context);
  }
}
