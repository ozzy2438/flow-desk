import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { DecisionBadge } from "@/components/DecisionBadge";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const job = await db.jobPosting.findUnique({
    where: { id: jobId },
    include: {
      evaluation: true,
      evidenceMatches: { include: { profileRecord: true } },
      decisionAudits: { orderBy: { createdAt: "desc" } },
      coverLetters: { orderBy: { createdAt: "desc" }, take: 1, include: { claims: true } },
    },
  });

  if (!job) notFound();

  const hardBlockers = (job.evaluation?.hardBlockers as Array<{ code: string; reason: string }>) ?? [];
  const softSignals =
    (job.evaluation?.softPreferenceSignals as Array<{ code: string; effect: string }>) ?? [];
  const deepReviewReasons = (job.evaluation?.deepReviewReasons as string[]) ?? [];
  const explanationFacts = (job.evaluation?.explanationFacts as string[]) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {[job.company, job.location, job.source].filter(Boolean).join(" · ")}
          </p>
          {job.sourceUrl && (
            <a href={job.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline">
              View original posting →
            </a>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          {job.evaluation && <DecisionBadge decision={job.evaluation.decision} />}
          <a
            href={`/cover-letter/${job.id}`}
            className="text-xs text-indigo-600 hover:underline"
          >
            Cover letter verification →
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <Field label="Workplace" value={job.workplaceType} />
        <Field label="Employment" value={job.employmentType} />
        <Field label="Seniority" value={job.seniority} />
        <Field
          label="Salary"
          value={
            job.salaryMin || job.salaryMax
              ? `${job.salaryMin ?? "?"}–${job.salaryMax ?? "?"} ${job.salaryCurrency ?? ""}`
              : "Unknown"
          }
        />
      </div>

      <div className="card p-4 text-xs text-slate-600">
        <p className="font-medium text-slate-700">Source verification</p>
        <p className="mt-1">
          Open status: {job.sourceOpenStatus}
          {job.sourceRetrievedAt
            ? ` · checked ${new Date(job.sourceRetrievedAt).toLocaleString()}`
            : " · not independently checked"}
        </p>
        <p className="mt-1">
          Posted date: {job.postedAt ? new Date(job.postedAt).toLocaleString() : "Unknown"} · basis: {job.postedAtBasis}
          {job.applicationDeadline
            ? ` · deadline ${new Date(job.applicationDeadline).toLocaleString()}`
            : ""}
        </p>
      </div>

      {job.evaluation && (
        <div className="card p-5">
          <h2 className="text-sm font-medium text-slate-700">
            Policy decision · {job.evaluation.policyVersion}
          </h2>

          {hardBlockers.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium uppercase text-red-600">Hard blockers</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-red-700">
                {hardBlockers.map((b) => (
                  <li key={b.code}>{b.reason}</li>
                ))}
              </ul>
            </div>
          )}

          {deepReviewReasons.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium uppercase text-amber-600">Review before applying</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-amber-700">
                {deepReviewReasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {softSignals.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium uppercase text-slate-500">Preference signals</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {softSignals.map((s, i) => (
                  <span
                    key={i}
                    className={`badge ${s.effect === "BOOST" ? "bg-green-100 text-green-700" : s.effect === "PENALTY" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}
                  >
                    {s.code}
                  </span>
                ))}
              </div>
            </div>
          )}

          {explanationFacts.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium uppercase text-slate-500">All structured facts</p>
              <ul className="mt-1 list-disc pl-5 text-xs text-slate-500">
                {explanationFacts.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {job.evidenceMatches.length > 0 && (
        <div className="card p-5">
          <h2 className="text-sm font-medium text-slate-700">Evidence matches</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {job.evidenceMatches.map((match) => (
              <li key={match.id} className="text-sm">
                <span className="badge bg-slate-100 text-slate-600">{match.category}</span>{" "}
                <span className="font-medium">{match.profileRecord.title}</span>
                {match.safeClaims.length > 0 && (
                  <p className="mt-1 text-xs text-green-700">
                    Safe claims: {match.safeClaims.join("; ")}
                  </p>
                )}
                {match.unsupportedRequirements.length > 0 && (
                  <p className="mt-1 text-xs text-amber-700">
                    Unsupported: {match.unsupportedRequirements.join("; ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card p-5">
        <h2 className="text-sm font-medium text-slate-700">Description</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{job.descriptionRaw}</p>
      </div>

      {job.decisionAudits.length > 0 && (
        <div className="card p-5">
          <h2 className="text-sm font-medium text-slate-700">Decision audit timeline</h2>
          <ul className="mt-2 flex flex-col gap-3">
            {job.decisionAudits.map((audit) => {
              const output = audit.outputResult as Record<string, unknown>;
              return (
                <li key={audit.id} className="border-l-2 border-slate-200 pl-3 text-sm">
                  <p className="text-xs text-slate-400">
                    {audit.provider} · {audit.question} ·{" "}
                    {new Date(audit.createdAt).toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-600">
                    recommendation: {String(output.recommendation)} · confidence:{" "}
                    {String(output.confidence)} · evidence: {String(output.evidenceRelevance)}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
