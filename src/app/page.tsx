import { ResearchComposer } from "@/components/ResearchComposer";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PLANNING: "Planning",
  QUEUED: "Queued",
  RUNNING: "Browsers working",
  COMPLETED: "Complete",
  PARTIAL_FAILURE: "Complete with handoff",
  FAILED: "Needs attention",
  CANCELLED: "Cancelled",
};

export default async function HomePage() {
  const user = await getCurrentUser();
  const recentRuns = await db.researchRun.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { flows: { select: { id: true, status: true, screenshots: { select: { id: true } } } } },
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-12 pb-16 pt-8">
      <section className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
          Browser-first job intelligence
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] text-slate-950 sm:text-6xl">
          Watch the search, not just the shortlist.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
          Flow Desk fans one goal into parallel browser flows. JEV chooses the next safe step, keeps
          only distinct screens, and passes verified jobs into your evidence and policy review.
        </p>
      </section>

      <ResearchComposer />

      <section className="grid gap-3 sm:grid-cols-3" aria-label="How Flow Desk stays bounded">
        <Proof title="JEV drives the browser" text="Chooses only from code-owned read-only actions." />
        <Proof title="Distinct screens only" text="Repeated and loading states stay out of the flow story." />
        <Proof title="You control the boundary" text="Login, CAPTCHA, messaging and applications stop for you." />
      </section>

      {recentRuns.length > 0 && (
        <section>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">History</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Recent flows</h2>
          </div>
          <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white">
            {recentRuns.map((run, index) => {
              const screenshotCount = run.flows.reduce((sum, flow) => sum + flow.screenshots.length, 0);
              return (
                <Link
                  key={run.id}
                  href={`/runs/${run.id}`}
                  className={`flex items-center justify-between gap-5 px-5 py-4 transition hover:bg-slate-50 ${
                    index > 0 ? "border-t border-slate-100" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{run.userGoal}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {run.flows.length} sources · {screenshotCount} distinct screens
                    </p>
                  </div>
                  <span className="flex-none rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {STATUS_LABEL[run.status] ?? run.status}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function Proof({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{text}</p>
    </div>
  );
}
