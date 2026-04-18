import { StudyWorkbench } from "@/components/study-workbench";
import { listRecentStudyRuns } from "@/lib/study/persistence";

export const dynamic = "force-dynamic";

export default async function Home() {
  const recentStudies = await listRecentStudyRuns().catch((error) => {
    console.error("Failed to load recent studies for the home page.", error);
    return [];
  });

  return (
    <StudyWorkbench
      key="home"
      initialHistory={recentStudies}
      initialPassageQuestions={[]}
    />
  );
}
