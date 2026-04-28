# Bible Study Agents

AI-assisted Bible study workspace built with Next.js, LangGraph, and OpenRouter.

Enter a chapter or chapter range like `John 3` or `John 3-4`, and the app will:

- Build a context pack with passage text, adjacent chapters, geography, cross references, and source diagnostics
- Run four analyst models in parallel
- Produce a final synthesis with thesis, consensus, differences, canonical links, verse-by-verse notes, and practical takeaways
- Optionally generate a voice overview
- Optionally persist studies and passage questions for shareable history

## Features

- Multi-model Bible passage analysis
- Live execution console over a streaming API route
- Translation comparison with provider diagnostics
- Adjacent chapter summaries for before/after context
- Geography and cross-reference context from OpenBible.info
- Final synthesis with pronunciation guide, prayer prompt, and open questions
- Optional saved study history and share links
- Optional passage-level Q&A saved against a persisted study
- Optional audio narration for the final overview

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- LangGraph
- LangChain
- OpenRouter via the OpenAI-compatible client
- Zod
- Postgres via `postgres`

## Model Defaults

- `openai/gpt-5.5`
- `anthropic/claude-opus-4.6`
- `google/gemini-3.1-pro-preview`
- `z-ai/glm-4.5`
- Final synthesis: `openai/gpt-5.5`

All model IDs can be overridden through environment variables.

## Getting Started

1. Install dependencies.
2. Copy `.env.example` to `.env.local`.
3. Add at least your OpenRouter API key.
4. Start the development server.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

`OPEN_ROUTER_API_KEY` is required.

### Required

```env
OPEN_ROUTER_API_KEY=
```

### Optional

```env
OPENROUTER_HTTP_REFERER=http://localhost:3000
OPENROUTER_APP_TITLE=Bible Study Agents
FAL_AI_API_KEY=
YVP_APP_KEY=
RAPIDAPI_KEY=
SUPABASE_CONNECTION_STRING=
RAPIDAPI_COMPLETE_STUDY_BIBLE_HOST=
STUDY_MODEL_GPT=openai/gpt-5.5
STUDY_MODEL_OPUS=anthropic/claude-opus-4.6
STUDY_MODEL_GEMINI=google/gemini-3.1-pro-preview
STUDY_MODEL_GLM=z-ai/glm-4.5
STUDY_MODEL_SYNTHESIS=openai/gpt-5.5
```

### What each optional variable enables

- `FAL_AI_API_KEY`
  Enables generated voice narration for the final overview.
- `YVP_APP_KEY`
  Enables direct YouVersion API reads for supported version aliases.
- `SUPABASE_CONNECTION_STRING`
  Enables persisted study history, shareable study pages, and saved passage questions.
- `RAPIDAPI_KEY`
  Reserved for supplemental study-note integrations.
- `RAPIDAPI_COMPLETE_STUDY_BIBLE_HOST`
  Reserved host configuration for the RapidAPI study-notes adapter.
- `STUDY_MODEL_*`
  Overrides the default analyst and synthesis model IDs.

The code also accepts legacy aliases `YV_APP_KEY` and `RAPID_API_KEY`, but the preferred names are `YVP_APP_KEY` and `RAPIDAPI_KEY`.

## Available Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
```

## How It Works

1. The app resolves a Bible chapter reference or chapter range and requested translations.
2. It loads passage text, adjacent chapter summaries, OpenBible context, and supplemental source metadata.
3. LangGraph fans out to four analyst agents in parallel.
4. A final synthesis agent merges the reports into one structured study result.
5. If configured, the app also generates a narrated audio overview.
6. If database persistence is configured, the result is saved and can be reopened by slug.

## Source Behavior

- YouVersion is used when `YVP_APP_KEY` is configured and the requested translation has a supported alias.
- If direct YouVersion passage access fails for a mapped translation, the app can fall back to Bible.com page extraction.
- Public Bible API remains the general fallback source.
- OpenBible geography is always part of the context pipeline.
- RapidAPI study notes are represented in the source catalog, but the production integration is still reserved rather than fully active.

## Project Structure

- `src/app/api/study/route.ts`
  Request/response study execution endpoint.
- `src/app/api/study/stream/route.ts`
  Streaming NDJSON study execution endpoint used by the live console.
- `src/app/api/study/qa/route.ts`
  Passage question endpoint for persisted studies.
- `src/lib/study/graph.ts`
  Orchestrates context, analyst fan-out, synthesis, and narration.
- `src/lib/study/context.ts`
  Builds the source bundle and diagnostics.
- `src/lib/study/providers/`
  Bible text, geography, and study-note adapters.
- `src/lib/study/persistence.ts`
  Persists study runs and loads them by slug or id.
- `src/lib/study/passage-qa.ts`
  Generates and stores passage-level answers.
- `src/lib/study/voice.ts`
  Generates the optional voice overview.
- `src/components/study-workbench.tsx`
  Main study UI and interaction surface.

## Notes for Public Deployment

- Do not commit `.env.local`.
- You need your own API keys for OpenRouter and any optional providers.
- Without `SUPABASE_CONNECTION_STRING`, the app still runs, but history, share pages, and passage Q&A are disabled.
- Without `FAL_AI_API_KEY`, the app still runs, but voice overview generation is skipped.

## Quality Checks

```bash
npm run lint
npm run typecheck
npm run build
```
