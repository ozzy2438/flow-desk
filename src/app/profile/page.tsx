import { getCurrentUser } from "@/server/auth";
import { getActiveProfileImport } from "@/server/profile/importProfile";
import { db } from "@/server/db";
import { ProfileImportForm } from "@/components/ProfileImportForm";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  const active = await getActiveProfileImport(user.id);
  const lastImport = await db.candidateProfileImport.findFirst({
    where: { userId: user.id },
    orderBy: { version: "desc" },
  });
  const lastImportFailed = lastImport && lastImport.status === "INVALID";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Candidate profile</h1>
        <p className="mt-1 text-sm text-slate-600">
          The imported evidence library grounds every apply-candidate decision and every generated
          cover-letter claim. Nothing here is invented by a model.
        </p>
      </div>

      {lastImportFailed && (
        <div className="card border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">
            Import v{lastImport.version} failed validation ({lastImport.errorCount} error
            {lastImport.errorCount === 1 ? "" : "s"}) and was not activated. The version below is
            still the one used for evaluation.
          </p>
          <ul className="mt-2 list-disc pl-5">
            {(lastImport.errors as Array<{ message: string }>).slice(0, 10).map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}

      <ProfileImportForm />

      {!active ? (
        <p className="text-sm text-slate-500">
          No active candidate profile yet. Import the three CSVs above, or run{" "}
          <code className="rounded bg-slate-100 px-1">pnpm db:seed</code> to load the demo profile.
        </p>
      ) : (
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-slate-700">
              Active profile · version {active.version}
            </h2>
            <span className="text-xs text-slate-400">{active.records.length} records</span>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-400">
                <tr>
                  <th className="py-1 pr-4">Kind</th>
                  <th className="py-1 pr-4">Evidence ID</th>
                  <th className="py-1 pr-4">Title</th>
                  <th className="py-1 pr-4">Skills</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {active.records.map((record) => {
                  const data = record.data as Record<string, unknown>;
                  const skills = Array.isArray(data.skills) ? (data.skills as string[]) : [];
                  return (
                    <tr key={record.id}>
                      <td className="py-2 pr-4 text-xs text-slate-500">{record.kind}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{record.evidenceId ?? "—"}</td>
                      <td className="py-2 pr-4">{record.title ?? "—"}</td>
                      <td className="py-2 pr-4 text-xs text-slate-500">{skills.join(", ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
