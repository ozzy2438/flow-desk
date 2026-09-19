"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProfileImportForm() {
  const router = useRouter();
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
      setMessage({ tone: "ok", text: `Imported version ${body.version} with ${body.rowCount} rows.` });
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
      <h3 className="text-sm font-medium text-slate-700">Import candidate profile</h3>
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
