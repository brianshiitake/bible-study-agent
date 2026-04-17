import { NextResponse } from "next/server";
import { DEFAULT_VERSION_IDS } from "@/lib/study/constants";
import { getChapterTextForVersion } from "@/lib/study/providers/bible-text";
import { parseChapterReference } from "@/lib/study/reference";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const reference = searchParams.get("reference");
    const version = searchParams.get("version") ?? DEFAULT_VERSION_IDS[0];

    if (!reference) {
      return NextResponse.json(
        { error: "Reference is required." },
        { status: 400 },
      );
    }

    const parsedReference = parseChapterReference(reference);
    const result = await getChapterTextForVersion(parsedReference, version);

    return NextResponse.json({
      reference: parsedReference.reference,
      versionId: result.text.versionId,
      versionLabel: result.text.versionLabel,
      description: result.text.description,
      sourceUrl: result.text.sourceUrl,
      verses: result.text.verses,
      provider: result.provider,
      warnings: result.warnings,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The chapter preview failed.",
      },
      { status: 500 },
    );
  }
}
