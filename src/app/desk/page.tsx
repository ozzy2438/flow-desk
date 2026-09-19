import Link from "next/link";
import { db } from "@/server/db";
import { DecisionBadge } from "@/components/DecisionBadge";

export const dynamic = "force-dynamic";

export default async function DailyDeskPage() {
  const jobs = await db.jobPosting.findMany({
    where: { evaluation: { decision: { in: ["APPLY_CANDIDATE", "REVIEW_REQUIRED"] } } },
    include: { evaluation: true, evidenceMatches: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const applyJobs = jobs.filter((j) => j.evaluation?.decision === "APPLY_CANDIDATE");
  const reviewJobs = jobs.filter((j) => j.evaluation?.decision === "REVIEW_REQUIRED");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Daily Desk</h1>
        <p className="mt-1 text-sm text-slate-600">
          Only the postings a strong application can actually be built for. Everything else stays
          in the Job Inbox rather than cluttering this view.
        </p>
      </div>

      <Section title="Apply candidates" jobs={applyJobs} emptyText="No strong apply candidates yet." />
      <Section title="Review required" jobs={reviewJobs} emptyText="Nothing needs review right now." />
    </div>
  );
}

function Section({
  title,
  jobs,
  emptyText,
}: {
  title: string;
  jobs: Array<{
    id: string;
    title: string;
    company: string | null;
    location: string | null;
    evaluation: { decision: string; decisionConfidence: number | null } | null;
    evidenceMatches: Array<{ category: string }>;
  }>;
  emptyText: string;
}) {
  return (
    <div>
      <h2 className="text-sm font-medium text-slate-500">
        {title} <span className="text-slate-400">({jobs.length})</span>
      </h2>
      {jobs.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{emptyText}</p>
      ) : (
        <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
          {jobs.map((job) => {
            const directMatches = job.evidenceMatches.filter((m) => m.category === "DIRECT").length;
            return (
              <Link key={job.id} href={`/jobs/${job.id}`} className="card block p-4 hover:border-indigo-300">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{job.title}</p>
                  {job.evaluation && <DecisionBadge decision={job.evaluation.decision} />}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {[job.company, job.location].filter(Boolean).join(" · ")}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  {directMatches} direct evidence match{directMatches === 1 ? "" : "es"}
                  {job.evaluation?.decisionConfidence != null &&
                    ` · confidence ${Math.round(job.evaluation.decisionConfidence * 100)}%`}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
