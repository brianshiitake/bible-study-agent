import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { runStudyGraph } from "@/lib/study/graph";
import { canPersistStudies, persistStudyResult } from "@/lib/study/persistence";
import { studyRequestSchema } from "@/lib/study/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = studyRequestSchema.parse(await request.json());
    const result = await runStudyGraph(body);
    const persisted = canPersistStudies()
      ? await persistStudyResult(result)
      : null;

    return NextResponse.json(persisted ?? result);
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
