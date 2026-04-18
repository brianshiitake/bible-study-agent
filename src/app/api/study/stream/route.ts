import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getDatabaseConnectionIssue } from "@/lib/db";
import { runStudyGraph } from "@/lib/study/graph";
import { createTimestamp } from "@/lib/study/events";
import { canPersistStudies, persistStudyResult } from "@/lib/study/persistence";
import {
  studyRequestSchema,
  type StudyResult,
} from "@/lib/study/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function addStudyWarning(study: StudyResult, warning: string) {
  return {
    ...study,
    warnings: Array.from(new Set([...study.warnings, warning])),
  };
}

export async function POST(request: Request) {
  try {
    const body = studyRequestSchema.parse(await request.json());
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        const send = (value: unknown) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
        };

        void (async () => {
          try {
            const result = await runStudyGraph(body, {
              onEvent: async (event) => send(event),
            });
            const databaseIssue = getDatabaseConnectionIssue();

            if (databaseIssue) {
              send({
                type: "log",
                scope: "system",
                target: "persistence",
                label: "Persistence",
                message: databaseIssue,
                timestamp: createTimestamp(),
              });
              send({
                type: "result",
                study: addStudyWarning(result, databaseIssue),
              });
              send({
                type: "complete",
                timestamp: createTimestamp(),
              });
              controller.close();
              return;
            }

            let persisted = null;

            try {
              persisted = canPersistStudies()
                ? await persistStudyResult(result)
                : null;
            } catch (error) {
              const message =
                error instanceof Error
                  ? error.message
                  : "Study persistence failed after the study completed.";

              console.error("Study persistence failed after a completed run.", error);
              send({
                type: "log",
                scope: "system",
                target: "persistence",
                label: "Persistence",
                message,
                timestamp: createTimestamp(),
              });
              send({
                type: "result",
                study: addStudyWarning(result, message),
              });
              send({
                type: "complete",
                timestamp: createTimestamp(),
              });
              controller.close();
              return;
            }

            send({
              type: "result",
              study: persisted ?? result,
            });
            send({
              type: "complete",
              timestamp: createTimestamp(),
            });
            controller.close();
          } catch (error) {
            send({
              type: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "Unexpected study failure.",
              timestamp: createTimestamp(),
            });
            controller.close();
          }
        })();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Invalid request.",
          details: error.flatten(),
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unexpected study failure.",
      },
      { status: 500 },
    );
  }
}
