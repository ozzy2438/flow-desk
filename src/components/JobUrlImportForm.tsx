"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function JobUrlImportForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/jobs/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = await response.json();
      if (!response.ok) {
        setMessage({
          tone: body.code === "MANUAL_CAPTURE_REQUIRED" ? "info" : "error",
          text: body.error ?? "Could not import this job URL.",
        });
        return;
      }
      router.push(`/jobs/${body.id}`);
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Could not import this job URL.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card flex flex-col gap-3 p-5">
      <div>
        <h3 className="text-sm font-medium text-slate-700">Import a public job URL</h3>
        <p className="mt-1 text-xs text-slate-500">
          Greenhouse and Lever use their official public read APIs. LinkedIn and SEEK stay
          session-assisted: keep the URL, then paste the full visible description in the manual form.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://job-boards.greenhouse.io/company/jobs/123456"
          required
          className="min-w-0 flex-1 rounded-md border border-slate-300 p-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "Importing…" : "Import and evaluate"}
        </button>
      </div>
      {message && (
        <p className={message.tone === "error" ? "text-sm text-red-600" : "text-sm text-indigo-700"}>
          {message.text}
        </p>
      )}
    </form>
  );
}
