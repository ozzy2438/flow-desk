import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/server/db";
import { GenerateCoverLetterButton } from "@/components/GenerateCoverLetterButton";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  READY: "bg-green-100 text-green-800",
  DRAFT: "bg-amber-100 text-amber-800",
  BLOCKED: "bg-red-100 text-red-800",
};

const CLAIM_STYLE: Record<string, string> = {
  SUPPORTED: "border-green-300 bg-green-50",
  PARTIALLY_SUPPORTED: "border-amber-300 bg-amber-50",
  AMBIGUOUS: "border-amber-300 bg-amber-50",
  UNSUPPORTED: "border-red-300 bg-red-50",
};

export default async function CoverLetterPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const job = await db.jobPosting.findUnique({ where: { id: jobId } });
  if (!job) notFound();

  const draft = await db.coverLetterDraft.findFirst({
    where: { jobId },
    orderBy: { createdAt: "desc" },
    include: { claims: true },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cover-letter verification</h1>
        <p className="mt-1 text-sm text-slate-600">
          <Link href={`/jobs/${job.id}`} className="underline">
            {job.title}
          </Link>{" "}
          · every sentence that asserts a fact is checked against your verified evidence before
          this can be marked Ready.
        </p>
      </div>

      <GenerateCoverLetterButton jobId={job.id} />

      {!draft ? (
        <p className="text-sm text-slate-500">No draft generated yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-700">Draft ({draft.provider})</h2>
              <span className={`badge ${STATUS_STYLE[draft.status]}`}>{draft.status}</span>
            </div>
            <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-slate-700">
              {draft.draftText}
            </pre>
          </div>

          <div className="card p-5">
            <h2 className="text-sm font-medium text-slate-700">Claim verification</h2>
            {draft.claims.length === 0 && (
              <p className="mt-2 text-sm text-slate-500">
                No fact-bearing sentences were found to verify.
              </p>
            )}
            <ul className="mt-2 flex flex-col gap-2">
              {draft.claims.map((claim) => (
                <li key={claim.id} className={`rounded-md border p-3 text-sm ${CLAIM_STYLE[claim.status]}`}>
                  <p className="font-medium">{claim.claimText}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    {claim.status} — {claim.reason}
                  </p>
                </li>
              ))}
            </ul>
            {draft.status === "BLOCKED" && (
              <p className="mt-3 text-sm font-medium text-red-700">
                Ready status is blocked until every unsupported claim is removed or rewritten.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
