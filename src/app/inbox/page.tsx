import Link from "next/link";
import { db } from "@/server/db";
import { getCurrentUser } from "@/server/auth";
import { PasteJobForm } from "@/components/PasteJobForm";
import { JobUrlImportForm } from "@/components/JobUrlImportForm";
import { DecisionBadge } from "@/components/DecisionBadge";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  await getCurrentUser();
  const jobs = await db.jobPosting.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { evaluation: true },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Job Inbox</h1>
        <p className="mt-1 text-sm text-slate-600">
          Every job Flow Desk has evaluated, most recent first. Discovery flows land jobs here
          automatically; you can also evaluate one manually below.
        </p>
      </div>

      <JobUrlImportForm />

      <PasteJobForm />

      <div className="card divide-y divide-slate-100">
        {jobs.length === 0 && (
          <p className="p-5 text-sm text-slate-500">No jobs evaluated yet.</p>
        )}
        {jobs.map((job) => (
          <Link
            key={job.id}
            href={`/jobs/${job.id}`}
            className="flex items-center justify-between gap-4 p-4 hover:bg-slate-50"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{job.title}</p>
              <p className="truncate text-xs text-slate-500">
                {[job.company, job.location, job.source].filter(Boolean).join(" · ")}
              </p>
            </div>
            {job.evaluation && <DecisionBadge decision={job.evaluation.decision} />}
          </Link>
        ))}
      </div>
    </div>
  );
}
