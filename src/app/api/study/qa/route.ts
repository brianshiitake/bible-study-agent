import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { canPersistStudies } from "@/lib/study/persistence";
import { answerPassageQuestion } from "@/lib/study/passage-qa";
import { passageQuestionRequestSchema } from "@/lib/study/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(request: Request) {
  try {
    if (!canPersistStudies()) {
      throw new Error(
        "Passage questions require SUPABASE_CONNECTION_STRING so answers can be stored.",
      );
    }

    const body = passageQuestionRequestSchema.parse(await request.json());
    const answer = await answerPassageQuestion(body);

    return NextResponse.json(answer);
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
          error instanceof Error ? error.message : "Unexpected question failure.",
      },
      { status: 500 },
    );
  }
}
