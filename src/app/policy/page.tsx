import { getCurrentUser } from "@/server/auth";
import { getActivePolicyImport } from "@/server/policy/importPolicy";
import { db } from "@/server/db";
import { PolicyImportForm } from "@/components/PolicyImportForm";

export const dynamic = "force-dynamic";

const ACTION_STYLE: Record<string, string> = {
  HARD_BLOCK: "bg-red-100 text-red-700",
  BOOST: "bg-green-100 text-green-700",
  PENALTY: "bg-amber-100 text-amber-700",
  REVIEW: "bg-indigo-100 text-indigo-700",
  NEUTRAL: "bg-slate-100 text-slate-600",
};

export default async function PolicyInspectorPage() {
  const user = await getCurrentUser();
  const active = await getActivePolicyImport(user.id);
  const lastImport = await db.decisionPolicyImport.findFirst({
    where: { userId: user.id },
    orderBy: { version: "desc" },
  });
  const lastImportFailed = lastImport && lastImport.status === "INVALID";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Policy inspector</h1>
        <p className="mt-1 text-sm text-slate-600">
          The policy engine is ordinary deterministic code driven by this versioned rule set.
          Hard blockers always win; an unknown field is never treated as a negative fact.
        </p>
      </div>

      {lastImportFailed && (
        <div className="card border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">
            Import v{lastImport.version} failed validation ({lastImport.errorCount} error
            {lastImport.errorCount === 1 ? "" : "s"}) and was not activated.
          </p>
          <ul className="mt-2 list-disc pl-5">
            {(lastImport.errors as Array<{ message: string }>).slice(0, 10).map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}

      <PolicyImportForm />

      {!active ? (
        <p className="text-sm text-slate-500">
          No active policy yet. Import decision-policy.json or the legacy CSV above, or run{" "}
          <code className="rounded bg-slate-100 px-1">pnpm db:seed</code> to load the demo policy.
        </p>
      ) : (
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-slate-700">
              Active policy · version {active.version}
            </h2>
            <span className="text-xs text-slate-400">{active.rules.length} rules</span>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-400">
                <tr>
                  <th className="py-1 pr-4">Code</th>
                  <th className="py-1 pr-4">Category</th>
                  <th className="py-1 pr-4">Condition</th>
                  <th className="py-1 pr-4">Action</th>
                  <th className="py-1 pr-4">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {active.rules.map((rule) => (
                  <tr key={rule.id} className={rule.active ? "" : "opacity-40"}>
                    <td className="py-2 pr-4 font-mono text-xs">{rule.code}</td>
                    <td className="py-2 pr-4 text-xs text-slate-500">{rule.category}</td>
                    <td className="py-2 pr-4 text-xs text-slate-500">
                      {rule.field} {rule.operator} {rule.value}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`badge ${ACTION_STYLE[rule.action] ?? ""}`}>{rule.action}</span>
                    </td>
                    <td className="py-2 pr-4 text-xs text-slate-600">{rule.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
