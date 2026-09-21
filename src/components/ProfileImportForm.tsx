"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProfileImportForm() {
  const router = useRouter();
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile/import", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) {
        setMessage({
          tone: "error",
          text: `Import rejected: ${body.errorCount} error(s). ${body.errors?.[0]?.message ?? ""}`,
        });
        return;
      }
      setMessage({
        tone: "ok",
        text: `Imported version ${body.version} with ${body.rowCount} records.`,
      });
      form.reset();
      router.refresh();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Import failed." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-slate-700">Import candidate profile</h3>
          <p className="mt-1 text-xs text-slate-500">
            JSON preserves the full Apply OS evidence and claim-safety model. CSV remains available
            for the original flat format.
          </p>
        </div>
        <select
          value={format}
          onChange={(event) => setFormat(event.target.value as "json" | "csv")}
          className="rounded-md border border-slate-300 p-2 text-sm"
          aria-label="Candidate profile import format"
        >
          <option value="json">Apply OS JSON</option>
          <option value="csv">Legacy CSV</option>
        </select>
      </div>

      {format === "json" ? (
        <>
          <label className="text-xs text-slate-500">
            candidate-profile.schema.json
            <input
              type="file"
              name="schemaJson"
              accept=".json,application/json"
              required
              className="mt-1 block w-full text-sm"
            />
          </label>
          <label className="text-xs text-slate-500">
            candidate-profile.json
            <input
              type="file"
              name="profileJson"
              accept=".json,application/json"
              required
              className="mt-1 block w-full text-sm"
            />
          </label>
        </>
      ) : (
        <>
          <label className="text-xs text-slate-500">
            candidate-profile.schema.csv
            <input
              type="file"
              name="schemaCsv"
              accept=".csv,text/csv"
              required
              className="mt-1 block w-full text-sm"
            />
          </label>
          <label className="text-xs text-slate-500">
            candidate-profile.csv
            <input
              type="file"
              name="profileCsv"
              accept=".csv,text/csv"
              required
              className="mt-1 block w-full text-sm"
            />
          </label>
        </>
      )}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "Importing…" : "Import"}
      </button>
      {message && (
        <p className={message.tone === "ok" ? "text-sm text-green-700" : "text-sm text-red-600"}>
          {message.text}
        </p>
      )}
    </form>
  );
}
