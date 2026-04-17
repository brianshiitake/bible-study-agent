import { ChatOpenAI } from "@langchain/openai";
import { getEnv } from "@/lib/env";

export type StudyModelConfig = {
  id: "gpt54" | "opus46" | "gemini31" | "glm45";
  label: string;
  model: string;
  lens: string;
};

export const MODEL_ORDER: StudyModelConfig["id"][] = [
  "gpt54",
  "opus46",
  "gemini31",
  "glm45",
];

export function getStudyModels(): StudyModelConfig[] {
  const env = getEnv();

  return [
    {
      id: "gpt54",
      label: "GPT-5.4",
      model: env.STUDY_MODEL_GPT,
      lens: "Textual structure, argument flow, and chapter-level logic.",
    },
    {
      id: "opus46",
      label: "Claude Opus 4.6",
      model: env.STUDY_MODEL_OPUS,
      lens: "Historical setting, pastoral nuance, and long-form synthesis.",
    },
    {
      id: "gemini31",
      label: "Gemini 3.1 Pro Preview",
      model: env.STUDY_MODEL_GEMINI,
      lens: "Canonical cross-references, long-context comparison, and thematic patterns.",
    },
    {
      id: "glm45",
      label: "GLM 4.5",
      model: env.STUDY_MODEL_GLM,
      lens: "Alternative interpretive framing, reasoning contrast, and concise synthesis.",
    },
  ];
}

export function getSynthesizerModel() {
  const env = getEnv();

  return {
    label: "Final Synthesis Agent",
    model: env.STUDY_MODEL_SYNTHESIS,
  };
}

export function getModelStackWarnings() {
  return [] as string[];
}

export function createOpenRouterModel(model: string) {
  const env = getEnv();

  return new ChatOpenAI({
    model,
    apiKey: env.OPEN_ROUTER_API_KEY,
    temperature: 0.2,
    timeout: 90_000,
    maxRetries: 2,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": env.OPENROUTER_HTTP_REFERER,
        "X-OpenRouter-Title": env.OPENROUTER_APP_TITLE,
      },
    },
  });
}
