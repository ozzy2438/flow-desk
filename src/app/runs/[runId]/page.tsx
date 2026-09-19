import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { RunDashboard } from "@/components/RunDashboard";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const run = await db.researchRun.findUnique({
    where: { id: runId },
    include: {
      flows: {
        orderBy: { createdAt: "asc" },
        include: {
          screenshots: { orderBy: { createdAt: "desc" }, take: 1 },
          events: { orderBy: { createdAt: "desc" }, take: 5 },
        },
      },
    },
  });

  if (!run) notFound();

  return <RunDashboard runId={run.id} initialRun={JSON.parse(JSON.stringify(run))} />;
}
