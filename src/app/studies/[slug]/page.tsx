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
  const [study, recentStudies] = await Promise.all([
    getStudyRunBySlug(slug),
    listRecentStudyRuns(),
  ]);

  if (!study) {
    notFound();
  }

  return (
    <StudyWorkbench
      key={study.slug}
      initialHistory={recentStudies}
      initialStudy={study}
      initialPassageQuestions={await listStudyPassageQuestions(study.id)}
    />
  );
}
