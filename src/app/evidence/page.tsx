import { getCurrentUser } from "@/server/auth";
import { getActiveProfileImport } from "@/server/profile/importProfile";

export const dynamic = "force-dynamic";

const KIND_ORDER = ["PROJECT", "EXPERIENCE", "SKILL", "EDUCATION"] as const;

export default async function EvidenceLibraryPage() {
  const user = await getCurrentUser();
  const active = await getActiveProfileImport(user.id);
  const evidenceRecords = (active?.records ?? []).filter((r) => r.evidenceId);

  const grouped = KIND_ORDER.map((kind) => ({
    kind,
    records: evidenceRecords.filter((r) => r.kind === kind),
  })).filter((group) => group.records.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Evidence library</h1>
        <p className="mt-1 text-sm text-slate-600">
          {evidenceRecords.length} verified evidence records
          {active ? ` · profile version ${active.version}` : ""}. Each one carries a stable
          evidence ID that a job&apos;s evidence matches and cover-letter claims must trace back
          to — nothing here is a percentage score standing in for proof.
        </p>
      </div>

      {evidenceRecords.length === 0 && (
        <p className="text-sm text-slate-500">
          No evidence imported yet. Visit the <a className="underline" href="/profile">Candidate
          Profile</a> page to import candidate-profile.csv, or run{" "}
          <code className="rounded bg-slate-100 px-1">pnpm db:seed</code>.
        </p>
      )}

      {grouped.map((group) => (
        <div key={group.kind}>
          <h2 className="text-sm font-medium text-slate-500">
            {group.kind} <span className="text-slate-400">({group.records.length})</span>
          </h2>
          <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
            {group.records.map((record) => {
              const data = record.data as Record<string, unknown>;
              const skills = Array.isArray(data.skills) ? (data.skills as string[]) : [];
              const tools = Array.isArray(data.tools) ? (data.tools as string[]) : [];
              return (
                <div key={record.id} className="card p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">{record.title}</h3>
                    <span className="font-mono text-xs text-slate-400">{record.evidenceId}</span>
                  </div>
                  {typeof data.summary === "string" && (
                    <p className="mt-1 text-sm text-slate-600">{data.summary}</p>
                  )}
                  {typeof data.outcome === "string" && data.outcome && (
                    <p className="mt-1 text-sm font-medium text-green-700">{data.outcome}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {[...skills, ...tools].map((tag) => (
                      <span key={tag} className="badge bg-slate-100 text-slate-600">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
