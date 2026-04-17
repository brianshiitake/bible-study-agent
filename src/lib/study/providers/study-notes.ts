import { getEnv } from "@/lib/env";
import { RAPIDAPI_COMPLETE_STUDY_BIBLE_URL } from "@/lib/study/constants";
import type { ParsedReference } from "@/lib/study/schemas";

export async function getStudyNotes(parsedReference: ParsedReference) {
  void parsedReference;
  const env = getEnv();

  if (!env.RAPIDAPI_KEY) {
    return {
      notes: [],
      warnings: [
        "RapidAPI Complete Study Bible integration is optional and currently inactive because RAPIDAPI_KEY is not set.",
      ],
      catalogEntry: {
        label: "Complete Study Bible",
        url: RAPIDAPI_COMPLETE_STUDY_BIBLE_URL,
        status: "inactive" as const,
        note: "Add RAPIDAPI_KEY to activate this source.",
      },
    };
  }

  return {
    notes: [],
    warnings: [],
    catalogEntry: {
      label: "Complete Study Bible",
      url: RAPIDAPI_COMPLETE_STUDY_BIBLE_URL,
      status: "inactive" as const,
      note: "Key present, but endpoint wiring is intentionally held until the contract is confirmed.",
    },
  };
}
