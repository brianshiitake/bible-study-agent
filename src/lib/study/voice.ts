import { fal } from "@fal-ai/client";
import { getEnv } from "@/lib/env";
import {
  studyVoiceNarrationSchema,
  type FinalSynthesis,
  type StudyContext,
} from "@/lib/study/schemas";
import { createTimestamp, type StudyRunEventHandler } from "@/lib/study/events";

const FAL_TTS_MODEL = "fal-ai/gemini-3.1-flash-tts";
const FAL_TTS_VOICE = "Charon";
const FAL_TTS_LANGUAGE_CODE = "English (US)";
const FAL_TTS_OUTPUT_FORMAT = "mp3" as const;

function buildNarrationText(reference: string, finalSynthesis: FinalSynthesis) {
  return [
    `Overview for ${reference}.`,
    finalSynthesis.thesis,
    "Historical relevance.",
    finalSynthesis.historicalSnapshot,
    "Prayer.",
    finalSynthesis.prayerPrompt,
  ].join("\n\n");
}

async function emitStatus(
  onEvent: StudyRunEventHandler | undefined,
  stage: "running" | "completed" | "failed",
  message: string,
) {
  await onEvent?.({
    type: "status",
    target: "narration",
    label: "Voice Overview",
    stage,
    message,
    timestamp: createTimestamp(),
  });
}

async function emitLog(onEvent: StudyRunEventHandler | undefined, message: string) {
  await onEvent?.({
    type: "log",
    scope: "audio",
    target: "narration",
    label: "Voice Overview",
    message,
    timestamp: createTimestamp(),
  });
}

export async function generateStudyVoiceNarration(
  context: StudyContext,
  finalSynthesis: FinalSynthesis,
  options: {
    onEvent?: StudyRunEventHandler;
  } = {},
) {
  const { FAL_AI_API_KEY } = getEnv();

  if (!FAL_AI_API_KEY) {
    await emitStatus(
      options.onEvent,
      "failed",
      "Voice overview skipped because FAL_AI_API_KEY is not configured.",
    );
    return {
      voiceNarration: null,
      warnings: [
        "Voice overview was skipped because FAL_AI_API_KEY is not configured.",
      ],
    };
  }

  const narrationText = buildNarrationText(
    context.parsedReference.reference,
    finalSynthesis,
  );

  try {
    fal.config({ credentials: FAL_AI_API_KEY });
    await emitStatus(
      options.onEvent,
      "running",
      "Generating voice overview with Charon.",
    );
    await emitLog(
      options.onEvent,
      "Submitting overview, historical relevance, and prayer to Fal TTS.",
    );

    const result = await fal.subscribe(FAL_TTS_MODEL, {
      input: {
        prompt: narrationText,
        style_instructions:
          "Read this as a warm, reverent, clear Bible-study narration with natural pauses between sections.",
        voice: FAL_TTS_VOICE,
        language_code: FAL_TTS_LANGUAGE_CODE,
        output_format: FAL_TTS_OUTPUT_FORMAT,
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          const message = update.logs
            .map((entry) => entry.message?.trim())
            .filter((entry): entry is string => Boolean(entry))
            .join(" ");

          if (message) {
            void emitLog(options.onEvent, message);
          }
        }
      },
    });

    const voiceNarration = studyVoiceNarrationSchema.parse({
      provider: "fal",
      model: FAL_TTS_MODEL,
      voice: FAL_TTS_VOICE,
      languageCode: FAL_TTS_LANGUAGE_CODE,
      format: FAL_TTS_OUTPUT_FORMAT,
      text: narrationText,
      audioUrl: result.data.audio.url,
    });

    await emitStatus(
      options.onEvent,
      "completed",
      "Voice overview generated.",
    );

    return {
      voiceNarration,
      warnings: [] as string[],
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Fal TTS failure.";

    await emitStatus(
      options.onEvent,
      "failed",
      "Voice overview generation failed.",
    );
    await emitLog(options.onEvent, `Fal TTS failed: ${message}`);

    return {
      voiceNarration: null,
      warnings: [`Voice overview generation failed: ${message}`],
    };
  }
}
