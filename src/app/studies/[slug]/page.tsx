import { notFound } from "next/navigation";
import { StudyWorkbench } from "@/components/study-workbench";
import { listStudyPassageQuestions } from "@/lib/study/passage-qa";
import {
  getStudyRunBySlug,
  listRecentStudyRuns,
} from "@/lib/study/persistence";

export const dynamic = "force-dynamic";

type StudyPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function StudyPage({ params }: StudyPageProps) {
  const { slug } = await params;
  const study = await getStudyRunBySlug(slug);

  if (!study) {
    notFound();
  }

  const [recentStudies, passageQuestions] = await Promise.all([
    listRecentStudyRuns().catch((error) => {
      console.error("Failed to load recent studies for a study page.", error);
      return [];
    }),
    listStudyPassageQuestions(study.id).catch((error) => {
      console.error("Failed to load saved passage questions.", error);
      return [];
    }),
  ]);

  return (
    <StudyWorkbench
      key={study.slug}
      initialHistory={recentStudies}
      initialStudy={study}
      initialPassageQuestions={passageQuestions}
    />
  );
}
