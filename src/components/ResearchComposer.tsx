"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const EXAMPLE_GOAL =
  "Find Melbourne or remote Data Scientist, AI Engineer, Applied AI Engineer, Frontend Engineer and Automation Engineer roles from the last 7 days. Include contract, fixed-term and independent-delivery-compatible opportunities. Only show me postings that a strong application can be built for from my verified evidence library.";

export function ResearchComposer() {
  const router = useRouter();
  const [goal, setGoal] = useState("");
  const [flowCount, setFlowCount] = useState(3);
  const [sourceUrls, setSourceUrls] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (goal.trim().length < 10) {
      setError("Describe your goal in a bit more detail.");
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
    <form onSubmit={handleSubmit} className="card flex flex-col gap-4 p-5">
      <div>
        <label htmlFor="goal" className="text-sm font-medium text-slate-700">
          Research goal
        </label>
        <textarea
          id="goal"
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          placeholder={EXAMPLE_GOAL}
          rows={4}
          className="mt-1 w-full rounded-md border border-slate-300 p-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="sourceUrls" className="text-sm font-medium text-slate-700">
          Live company boards <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <textarea
          id="sourceUrls"
          value={sourceUrls}
          onChange={(event) => setSourceUrls(event.target.value)}
          placeholder={"One public Greenhouse or Lever company board URL per line\nhttps://job-boards.greenhouse.io/company\nhttps://jobs.lever.co/company"}
          rows={3}
          className="mt-1 w-full rounded-md border border-slate-300 p-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <p className="mt-1 text-xs text-slate-400">
          If supplied, the run uses only these official public ATS sources. LinkedIn and SEEK jobs
          are captured from the signed-in browser through Job Inbox, never scraped unattended.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <label htmlFor="flowCount" className="text-sm font-medium text-slate-700">
          Flow count
        </label>
        <input
          id="flowCount"
          type="range"
          min={1}
          max={10}
          value={flowCount}
          onChange={(event) => setFlowCount(Number(event.target.value))}
          className="w-48"
        />
        <span className="w-6 text-sm text-slate-600">{flowCount}</span>
        <span className="text-xs text-slate-400">
          Default 3, max 10 · only a safe number run concurrently
        </span>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          Read-only discovery only. Nothing is ever submitted or messaged on your behalf.
        </p>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {submitting ? "Planning flows…" : "Plan discovery flows"}
        </button>
      </div>
    </form>
  );
}
