import { ResearchComposer } from "@/components/ResearchComposer";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  const recentRuns = await db.researchRun.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { flows: { select: { id: true, status: true } } },
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Research a job goal</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Describe what you&apos;re looking for. Flow Desk plans up to 10 bounded, read-only
          discovery flows, runs a safe number in parallel, and only asks for your attention on
          strong apply candidates and postings that need review.
        </p>
      </div>

      <ResearchComposer />

      {recentRuns.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-slate-500">Recent research runs</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {recentRuns.map((run) => (
              <li key={run.id} className="card flex items-center justify-between px-4 py-3">
                <div>
                  <Link href={`/runs/${run.id}`} className="font-medium hover:underline">
                    {run.userGoal.length > 90 ? `${run.userGoal.slice(0, 90)}…` : run.userGoal}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {run.flows.length} flows · {run.status}
                  </p>
                </div>
                <Link
                  href={`/runs/${run.id}`}
                  className="text-sm text-indigo-600 hover:text-indigo-800"
                >
                  Open →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
