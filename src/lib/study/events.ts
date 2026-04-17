import type { PersistedStudyResult, StudyResult } from "@/lib/study/schemas";

export type StudyRunStage = "queued" | "running" | "completed" | "failed";
export type StudyRunScope = "system" | "context" | "agent" | "synthesis" | "audio";

export type StudyRunEvent =
  | {
      type: "run-start";
      runId: string;
      reference: string;
      versions: string[];
      timestamp: string;
    }
  | {
      type: "status";
      target: string;
      label: string;
      stage: StudyRunStage;
      message: string;
      timestamp: string;
    }
  | {
      type: "log";
      scope: StudyRunScope;
      message: string;
      timestamp: string;
      target?: string;
      label?: string;
    }
  | {
      type: "result";
      study: StudyResult | PersistedStudyResult;
    }
  | {
      type: "error";
      message: string;
      timestamp: string;
    }
  | {
      type: "complete";
      timestamp: string;
    };

export type StudyRunEventHandler = (
  event: StudyRunEvent,
) => void | Promise<void>;

export function createTimestamp() {
  return new Date().toISOString();
}
