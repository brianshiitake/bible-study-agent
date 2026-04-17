import { z } from "zod";

const envSchema = z.object({
  OPEN_ROUTER_API_KEY: z.string().min(1, "OPEN_ROUTER_API_KEY is required."),
  OPENROUTER_HTTP_REFERER: z.string().url().default("http://localhost:3000"),
  OPENROUTER_APP_TITLE: z.string().default("Bible Study Agents"),
  FAL_AI_API_KEY: z.string().optional(),
  YVP_APP_KEY: z.string().optional(),
  RAPIDAPI_KEY: z.string().optional(),
  SUPABASE_CONNECTION_STRING: z.string().optional(),
  RAPIDAPI_COMPLETE_STUDY_BIBLE_HOST: z.string().optional(),
  STUDY_MODEL_GPT: z.string().default("openai/gpt-5.4"),
  STUDY_MODEL_OPUS: z.string().default("anthropic/claude-opus-4.6"),
  STUDY_MODEL_GEMINI: z.string().default("google/gemini-3.1-pro-preview"),
  STUDY_MODEL_GLM: z.string().default("z-ai/glm-4.5"),
  STUDY_MODEL_SYNTHESIS: z.string().default("openai/gpt-5.4"),
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  cachedEnv = envSchema.parse({
    OPEN_ROUTER_API_KEY: process.env.OPEN_ROUTER_API_KEY,
    OPENROUTER_HTTP_REFERER: process.env.OPENROUTER_HTTP_REFERER,
    OPENROUTER_APP_TITLE: process.env.OPENROUTER_APP_TITLE,
    FAL_AI_API_KEY: process.env.FAL_AI_API_KEY,
    YVP_APP_KEY: process.env.YVP_APP_KEY ?? process.env.YV_APP_KEY,
    RAPIDAPI_KEY: process.env.RAPIDAPI_KEY ?? process.env.RAPID_API_KEY,
    SUPABASE_CONNECTION_STRING: process.env.SUPABASE_CONNECTION_STRING,
    RAPIDAPI_COMPLETE_STUDY_BIBLE_HOST:
      process.env.RAPIDAPI_COMPLETE_STUDY_BIBLE_HOST,
    STUDY_MODEL_GPT: process.env.STUDY_MODEL_GPT,
    STUDY_MODEL_OPUS: process.env.STUDY_MODEL_OPUS,
    STUDY_MODEL_GEMINI: process.env.STUDY_MODEL_GEMINI,
    STUDY_MODEL_GLM: process.env.STUDY_MODEL_GLM,
    STUDY_MODEL_SYNTHESIS: process.env.STUDY_MODEL_SYNTHESIS,
  });

  return cachedEnv;
}
