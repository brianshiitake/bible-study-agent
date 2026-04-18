import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getDatabaseConnectionIssue } from "@/lib/db";
import { runStudyGraph } from "@/lib/study/graph";
import { canPersistStudies, persistStudyResult } from "@/lib/study/persistence";
import type { StudyResult } from "@/lib/study/schemas";
import { studyRequestSchema } from "@/lib/study/schemas";

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
    const result = await runStudyGraph(body);
    const databaseIssue = getDatabaseConnectionIssue();

    if (databaseIssue) {
      console.error("Study persistence disabled due to database configuration.", {
        message: databaseIssue,
      });
      return NextResponse.json(addStudyWarning(result, databaseIssue));
    }

    try {
      const persisted = canPersistStudies()
        ? await persistStudyResult(result)
        : null;

      return NextResponse.json(persisted ?? result);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Study persistence failed after the study completed.";

      console.error("Study persistence failed after a completed run.", error);

      return NextResponse.json(addStudyWarning(result, message));
    }
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

    const message =
      error instanceof Error ? error.message : "Unexpected study failure.";

    return NextResponse.json(
      {
        error: message,
      },
      { status: 500 },
    );
  }
}
