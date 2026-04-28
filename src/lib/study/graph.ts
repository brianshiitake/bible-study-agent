import { randomUUID } from "node:crypto";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { runAnalystAgent, runFinalSynthesisAgent } from "@/lib/study/agents";
import { buildStudyContext } from "@/lib/study/context";
import {
  createTimestamp,
  type StudyRunEventHandler,
} from "@/lib/study/events";
import { MODEL_ORDER, getStudyModels } from "@/lib/study/models";
import { generateStudyVoiceNarration } from "@/lib/study/voice";
import {
  normalizeStudyRequest,
  studyResultSchema,
  type AnalystReport,
  type FinalSynthesis,
  type NormalizedStudyRequest,
  type StudyRequest,
  type StudyContext,
  type StudyVoiceNarration,
} from "@/lib/study/schemas";

const StudyGraphState = Annotation.Root({
  input: Annotation<NormalizedStudyRequest>,
  context: Annotation<StudyContext | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  reports: Annotation<AnalystReport[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
  finalSynthesis: Annotation<FinalSynthesis | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  voiceNarration: Annotation<StudyVoiceNarration | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  warnings: Annotation<string[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
});

type StudyState = typeof StudyGraphState.State;

function sortReports(reports: AnalystReport[]) {
  const order = new Map(MODEL_ORDER.map((modelId, index) => [modelId, index]));

  return [...reports].sort(
    (left, right) =>
      (order.get(left.modelId as (typeof MODEL_ORDER)[number]) ?? 999) -
      (order.get(right.modelId as (typeof MODEL_ORDER)[number]) ?? 999),
  );
}

function ensureContext(state: StudyState) {
  if (!state.context) {
    throw new Error("Study context was not prepared.");
  }

  return state.context;
}

type RunStudyGraphOptions = {
  onEvent?: StudyRunEventHandler;
  runId?: string;
};

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

function prepareContextNode(options: RunStudyGraphOptions) {
  return async (state: StudyState) => {
    await emitStatus(
      options.onEvent,
      "context",
      "Context",
      "running",
      "Preparing passage text, related chapters, geography, cross references, and notes.",
    );
    const context = await buildStudyContext(state.input, {
      onEvent: options.onEvent,
    });
    await emitStatus(
      options.onEvent,
      "context",
      "Context",
      "completed",
      "Context bundle prepared.",
    );

    return {
      context,
      warnings: context.sourceDiagnostics,
    };
  };
}

function createAnalystNode(
  modelId: (typeof MODEL_ORDER)[number],
  options: RunStudyGraphOptions,
) {
  return async (state: StudyState) => {
    const context = ensureContext(state);
    const model = getStudyModels().find((entry) => entry.id === modelId);

    if (!model) {
      throw new Error(`Unknown model slot "${modelId}".`);
    }

    const report = await runAnalystAgent(model, context, state.input, {
      onEvent: options.onEvent,
    });

    return {
      reports: [report],
      warnings:
        report.confidence === "low"
          ? [`${report.modelLabel} returned a low-confidence or fallback result.`]
          : [],
    };
  };
}

function synthesizeNode(options: RunStudyGraphOptions) {
  return async (state: StudyState) => {
    const context = ensureContext(state);
    const finalSynthesis = await runFinalSynthesisAgent(
      context,
      sortReports(state.reports),
      state.input,
      { onEvent: options.onEvent },
    );

    return { finalSynthesis };
  };
}

function narrationNode(options: RunStudyGraphOptions) {
  return async (state: StudyState) => {
    const context = ensureContext(state);

    if (!state.finalSynthesis) {
      throw new Error("Voice narration cannot run before the final synthesis is ready.");
    }

    const { voiceNarration, warnings } = await generateStudyVoiceNarration(
      context,
      state.finalSynthesis,
      { onEvent: options.onEvent },
    );

    return {
      voiceNarration,
      warnings,
    };
  };
}

function buildCompiledGraph(options: RunStudyGraphOptions) {
  return new StateGraph(StudyGraphState)
    .addNode("prepareContext", prepareContextNode(options))
    .addNode("gpt55", createAnalystNode("gpt55", options))
    .addNode("opus46", createAnalystNode("opus46", options))
    .addNode("gemini31", createAnalystNode("gemini31", options))
    .addNode("glm45", createAnalystNode("glm45", options))
    .addNode("synthesize", synthesizeNode(options))
    .addNode("narration", narrationNode(options))
    .addEdge(START, "prepareContext")
    .addEdge("prepareContext", "gpt55")
    .addEdge("prepareContext", "opus46")
    .addEdge("prepareContext", "gemini31")
    .addEdge("prepareContext", "glm45")
    .addEdge("gpt55", "synthesize")
    .addEdge("opus46", "synthesize")
    .addEdge("gemini31", "synthesize")
    .addEdge("glm45", "synthesize")
    .addEdge("synthesize", "narration")
    .addEdge("narration", END)
    .compile();
}

export async function runStudyGraph(
  request: StudyRequest,
  options: RunStudyGraphOptions = {},
) {
  const normalizedRequest = normalizeStudyRequest(request);
  const runId = options.runId ?? randomUUID();
  await options.onEvent?.({
    type: "run-start",
    runId,
    reference: normalizedRequest.reference,
    versions: normalizedRequest.versions,
    timestamp: createTimestamp(),
  });
  const graph = buildCompiledGraph({
    ...options,
    runId,
  });
  const result = await graph.invoke({ input: normalizedRequest });
  const warnings = Array.from(new Set(result.warnings));

  if (!result.context || !result.finalSynthesis) {
    throw new Error("The study graph finished without a final result.");
  }

  const study = studyResultSchema.parse({
    request: normalizedRequest,
    context: result.context,
    reports: sortReports(result.reports),
    finalSynthesis: result.finalSynthesis,
    voiceNarration: result.voiceNarration,
    generatedAt: new Date().toISOString(),
    warnings,
  });
  await options.onEvent?.({
    type: "log",
    scope: "system",
    target: "run",
    label: "Run",
    message: "Study workflow finished and the result payload was assembled.",
    timestamp: createTimestamp(),
  });

  return study;
}
