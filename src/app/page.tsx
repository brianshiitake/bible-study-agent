import { StudyWorkbench } from "@/components/study-workbench";
import { listRecentStudyRuns } from "@/lib/study/persistence";

export const dynamic = "force-dynamic";

export default async function Home() {
  const recentStudies = await listRecentStudyRuns();

  return (
    <StudyWorkbench
      key="home"
      initialHistory={recentStudies}
      initialPassageQuestions={[]}
    />
  );
}
