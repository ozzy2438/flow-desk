"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type FlowEvent = {
  id: string;
  kind: string;
  label: string;
  createdAt: string;
  data?: Record<string, unknown>;
};

type FlowSnapshot = {
  id: string;
  source: string;
  title: string;
  status: string;
  failureCategory: string | null;
  jobsDiscovered: number;
  jobsNormalized: number;
  jobsApplyCandidate: number;
  jobsReviewRequired: number;
  jobsSkipped: number;
  startedAt: string | null;
  finishedAt: string | null;
  screenshots: Array<{ id: string; stepLabel: string; createdAt: string }>;
  events: FlowEvent[];
};

type RunSnapshot = {
  id: string;
  userGoal: string;
  mode: string;
  status: string;
  requestedFlowCount: number;
  flows: FlowSnapshot[];
};

const STATUS_LABEL: Record<string, string> = {
  QUEUED: "Queued",
  OPENING_BROWSER: "Opening browser",
  OPEN_PAGE: "Reading source",
  SEARCHING: "Searching",
  OPENING_JOB_DETAIL: "Opening detail",
  EXTRACTING: "Extracting",
  EVALUATING: "Matching evidence",
  COMPLETE: "Complete",
  FAILED: "Needs handoff",
  CANCELLED: "Stopped",
};

const STATUS_STYLE: Record<string, string> = {
  QUEUED: "bg-slate-100 text-slate-600",
  OPENING_BROWSER: "bg-blue-50 text-blue-700",
  OPEN_PAGE: "bg-blue-50 text-blue-700",
  SEARCHING: "bg-blue-50 text-blue-700",
  OPENING_JOB_DETAIL: "bg-violet-50 text-violet-700",
  EXTRACTING: "bg-violet-50 text-violet-700",
  EVALUATING: "bg-amber-50 text-amber-700",
  COMPLETE: "bg-[#eefbe7] text-[#32752a]",
  FAILED: "bg-rose-50 text-rose-700",
  CANCELLED: "bg-slate-100 text-slate-600",
};

const RUN_STATUS_LABEL: Record<string, string> = {
  QUEUED: "Queued",
  RUNNING: "Running",
  COMPLETED: "Complete",
  PARTIAL_FAILURE: "Complete with handoffs",
  FAILED: "Needs attention",
  CANCELLED: "Stopped",
};

const FAILURE_MESSAGES: Record<string, string> = {
  LOGIN_REQUIRED:
    "This source needs your signed-in browser. Flow Desk stopped before cookies, login, CAPTCHA, or anti-bot controls.",
  CAPTCHA: "Human verification appeared. The flow stopped without trying to bypass it.",
  RATE_LIMITED: "The source limited requests. Retry later or inspect it manually.",
  TIMEOUT: "The page did not reach a usable state within the flow budget.",
  NETWORK: "A network error interrupted this source.",
  EXTRACTION_INCOMPLETE: "Critical job fields were not visible, so the result needs review.",
  POLICY_BLOCKED: "The source or requested action is outside the read-only policy.",
  UNKNOWN: "The source stopped unexpectedly.",
};

function elapsed(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt) return "Waiting";
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 1000));
  return `${seconds}s`;
}

function FlowCard({ flow, onStop }: { flow: FlowSnapshot; onStop: (flowId: string) => void }) {
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const isTerminal = ["COMPLETE", "FAILED", "CANCELLED"].includes(flow.status);
  const latestEvent = flow.events[0];
  const latestJevEvent = flow.events.find(
    (event) => event.kind === "BROWSER_DECISION" && event.data?.provider === "JEV",
  );
  const selectedShot = flow.screenshots.find((shot) => shot.id === selectedShotId);
  const manualHandoff = flow.failureCategory === "LOGIN_REQUIRED";

  return (
    <article className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.06)]">
      <header className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-semibold text-slate-950">{flow.title}</h2>
            {latestJevEvent && (
              <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white">
                JEV driven
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {elapsed(flow.startedAt, flow.finishedAt)} · {latestEvent?.label ?? "Waiting to start"}
          </p>
        </div>
        <div className="flex flex-none items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLE[flow.status] ?? STATUS_STYLE.QUEUED}`}>
            {STATUS_LABEL[flow.status] ?? flow.status}
          </span>
          {!isTerminal && (
            <button
              type="button"
              onClick={() => onStop(flow.id)}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Stop
            </button>
          )}
        </div>
      </header>

      <div className="p-5">
        {flow.screenshots.length > 0 ? (
          <div className="flow-shot-rail" aria-label={`${flow.title} browser screens`}>
            {flow.screenshots.map((shot, index) => (
              <button
                type="button"
                key={shot.id}
                onClick={() => setSelectedShotId(shot.id)}
                className="group w-[290px] flex-none text-left"
              >
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-md">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/screenshots/${shot.id}`}
                    alt={shot.stepLabel}
                    className="h-44 w-full object-cover object-top"
                  />
                </div>
                <p className="mt-2 line-clamp-2 text-xs font-medium leading-5 text-slate-700">
                  <span className="mr-1 text-slate-400">{String(index + 1).padStart(2, "0")}</span>
                  {shot.stepLabel}
                </p>
              </button>
            ))}
          </div>
        ) : manualHandoff ? (
          <div className="flex flex-col gap-4 rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-amber-950">Your browser takes this step</p>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-amber-800">
                {FAILURE_MESSAGES.LOGIN_REQUIRED}
              </p>
            </div>
            <Link
              href="/inbox"
              className="flex-none rounded-full bg-amber-950 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-900"
            >
              Capture visible job
            </Link>
          </div>
        ) : (
          <div className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-slate-100 p-5">
            <p className="text-xs font-medium text-slate-400">Browser screen is arriving…</p>
          </div>
        )}

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            {flow.failureCategory && !manualHandoff && (
              <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
                {FAILURE_MESSAGES[flow.failureCategory] ?? FAILURE_MESSAGES.UNKNOWN}
              </p>
            )}
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
              {flow.events.slice(0, 4).map((event) => (
                <p key={event.id} className="max-w-sm truncate">
                  <span className="font-semibold text-slate-700">{event.kind.replaceAll("_", " ")}</span>{" "}
                  {event.label}
                </p>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <Stat label="Found" value={flow.jobsDiscovered} />
            <Stat label="Apply" value={flow.jobsApplyCandidate} tone="text-emerald-700" />
            <Stat label="Review" value={flow.jobsReviewRequired} tone="text-amber-700" />
            <Stat label="Skip" value={flow.jobsSkipped} tone="text-slate-500" />
          </div>
        </div>
      </div>

      {selectedShot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-5"
          role="dialog"
          aria-modal="true"
          aria-label={selectedShot.stepLabel}
          onClick={() => setSelectedShotId(null)}
        >
          <div className="max-h-[92vh] max-w-6xl overflow-hidden rounded-3xl bg-white p-3" onClick={(event) => event.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/screenshots/${selectedShot.id}`}
              alt={selectedShot.stepLabel}
              className="max-h-[80vh] w-full rounded-2xl object-contain"
            />
            <div className="flex items-center justify-between gap-4 px-2 pb-1 pt-3">
              <p className="text-sm font-medium text-slate-800">{selectedShot.stepLabel}</p>
              <button
                type="button"
                onClick={() => setSelectedShotId(null)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="min-w-14 rounded-xl bg-slate-50 px-2 py-2">
      <p className={`text-sm font-semibold ${tone ?? "text-slate-800"}`}>{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

export function RunDashboard({ runId, initialRun }: { runId: string; initialRun: RunSnapshot }) {
  const [run, setRun] = useState<RunSnapshot>(initialRun);

  useEffect(() => {
    const source = new EventSource(`/api/runs/${runId}/events`);
    source.onmessage = (event) => {
      try {
        setRun(JSON.parse(event.data) as RunSnapshot);
      } catch {
        // Ignore a malformed frame and keep the last verified snapshot.
      }
    };
    source.addEventListener("done", () => source.close());
    return () => source.close();
  }, [runId]);

  const totals = useMemo(
    () =>
      run.flows.reduce(
        (acc, flow) => ({
          discovered: acc.discovered + flow.jobsDiscovered,
          normalized: acc.normalized + flow.jobsNormalized,
          apply: acc.apply + flow.jobsApplyCandidate,
          review: acc.review + flow.jobsReviewRequired,
          skip: acc.skip + flow.jobsSkipped,
          screens: acc.screens + flow.screenshots.length,
        }),
        { discovered: 0, normalized: 0, apply: 0, review: 0, skip: 0, screens: 0 },
      ),
    [run.flows],
  );
  const isTerminal = ["COMPLETED", "CANCELLED", "PARTIAL_FAILURE", "FAILED"].includes(run.status);

  async function handleStopFlow(flowId: string) {
    await fetch(`/api/flows/${flowId}/stop`, { method: "POST" });
  }

  async function handleStopAll() {
    await fetch(`/api/runs/${runId}/stop`, { method: "POST" });
  }

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6 pb-16 pt-2">
      <section className="rounded-[32px] bg-slate-950 px-6 py-7 text-white sm:px-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Live browser research · {run.mode.endsWith("MOBILE_WEB") ? "Mobile web" : "Desktop"}
            </p>
            <h1 className="mt-3 max-w-4xl text-2xl font-semibold leading-tight tracking-[-0.03em] sm:text-3xl">
              {run.userGoal}
            </h1>
            <p className="mt-4 text-sm text-slate-400">
              {run.flows.length} source flows · {totals.screens} distinct screens · {totals.discovered} jobs found
            </p>
          </div>
          <div className="flex flex-none items-center gap-2">
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white">
              {RUN_STATUS_LABEL[run.status] ?? run.status.replaceAll("_", " ")}
            </span>
            {!isTerminal && (
              <button
                type="button"
                onClick={handleStopAll}
                className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
              >
                Stop all
              </button>
            )}
          </div>
        </div>
      </section>

      {run.flows.map((flow) => (
        <FlowCard key={flow.id} flow={flow} onStop={handleStopFlow} />
      ))}

      {isTerminal && (
        <section className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Research landed</p>
            <p className="mt-1 text-sm text-slate-600">
              {totals.normalized} evaluated · {totals.apply} strong apply · {totals.review} review · {totals.skip} skipped
            </p>
          </div>
          <Link href="/desk" className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
            Open Daily Desk
          </Link>
        </section>
      )}
    </div>
  );
}
