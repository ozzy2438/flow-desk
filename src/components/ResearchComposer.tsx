"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const EXAMPLE_GOAL =
  "Find fresh Melbourne or remote Data Engineer and Applied AI roles I can support with verified evidence.";

export function ResearchComposer() {
  const router = useRouter();
  const [goal, setGoal] = useState("");
  const [flowCount, setFlowCount] = useState(3);
  const [deviceMode, setDeviceMode] = useState<"DESKTOP" | "MOBILE_WEB">("DESKTOP");
  const [linkedIn, setLinkedIn] = useState(true);
  const [seek, setSeek] = useState(true);
  const [sourceUrls, setSourceUrls] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (goal.trim().length < 10) {
      setError("Describe the job search in a little more detail.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal,
          requestedFlowCount: flowCount,
          deviceMode,
          sourceOptions: { linkedIn, seek },
          sourceUrls: sourceUrls
            .split(/\r?\n/)
            .map((value) => value.trim())
            .filter(Boolean),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed with ${res.status}`);
      }
      const data = (await res.json()) as { id: string };
      router.push(`/runs/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flow-composer">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            New browser research
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
            Grab fresh job flows from the web
          </h2>
        </div>
        <span className="rounded-full bg-[#eefbe7] px-3 py-1 text-xs font-semibold text-[#32752a]">
          JEV routing live
        </span>
      </div>

      <label htmlFor="goal" className="sr-only">
        Research goal
      </label>
      <textarea
        id="goal"
        value={goal}
        onChange={(event) => setGoal(event.target.value)}
        placeholder={EXAMPLE_GOAL}
        rows={3}
        className="w-full resize-none border-0 bg-transparent text-lg leading-7 text-slate-950 outline-none placeholder:text-slate-400 focus:ring-0"
      />

      <div className="mt-5 flex flex-col gap-4 border-t border-slate-200 pt-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <label htmlFor="flowCount" className="text-xs font-semibold text-slate-600">
              Flows {flowCount}
            </label>
            <input
              id="flowCount"
              type="range"
              min={1}
              max={10}
              value={flowCount}
              onChange={(event) => setFlowCount(Number(event.target.value))}
              className="w-28 accent-slate-950"
            />
          </div>

          <div className="segmented-control" aria-label="Browser viewport">
            <button
              type="button"
              onClick={() => setDeviceMode("DESKTOP")}
              aria-pressed={deviceMode === "DESKTOP"}
              className={deviceMode === "DESKTOP" ? "is-active" : ""}
            >
              Desktop
            </button>
            <button
              type="button"
              onClick={() => setDeviceMode("MOBILE_WEB")}
              aria-pressed={deviceMode === "MOBILE_WEB"}
              className={deviceMode === "MOBILE_WEB" ? "is-active" : ""}
            >
              Mobile web
            </button>
          </div>

          <label className="source-toggle">
            <input
              type="checkbox"
              checked={linkedIn}
              onChange={(event) => setLinkedIn(event.target.checked)}
            />
            LinkedIn handoff
          </label>
          <label className="source-toggle">
            <input
              type="checkbox"
              checked={seek}
              onChange={(event) => setSeek(event.target.checked)}
            />
            SEEK handoff
          </label>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-50"
        >
          {submitting ? "Opening flows…" : "Start research"}
        </button>
      </div>

      <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">
          Add public Greenhouse or Lever company boards
        </summary>
        <label htmlFor="sourceUrls" className="sr-only">
          Public company board URLs
        </label>
        <textarea
          id="sourceUrls"
          value={sourceUrls}
          onChange={(event) => setSourceUrls(event.target.value)}
          placeholder={"One board URL per line\nhttps://job-boards.greenhouse.io/company\nhttps://jobs.lever.co/company"}
          rows={3}
          className="mt-3 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-slate-500"
        />
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Public ATS pages can run unattended. LinkedIn and SEEK stop at the signed-in-session
          boundary and ask you to capture the visible job; Flow Desk never copies cookies or bypasses
          anti-bot checks.
        </p>
      </details>

      {error && <p className="mt-3 text-sm font-medium text-red-700">{error}</p>}
    </form>
  );
}
