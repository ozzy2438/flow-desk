"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

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
  events: Array<{ id: string; kind: string; label: string; createdAt: string }>;
};

type RunSnapshot = {
  id: string;
  userGoal: string;
  status: string;
  requestedFlowCount: number;
  flows: FlowSnapshot[];
};

const STATUS_STYLE: Record<string, string> = {
  QUEUED: "bg-slate-100 text-slate-600",
  OPENING_BROWSER: "bg-indigo-100 text-indigo-700",
  OPEN_PAGE: "bg-indigo-100 text-indigo-700",
  SEARCHING: "bg-indigo-100 text-indigo-700",
  OPENING_JOB_DETAIL: "bg-indigo-100 text-indigo-700",
  EXTRACTING: "bg-indigo-100 text-indigo-700",
  EVALUATING: "bg-indigo-100 text-indigo-700",
  COMPLETE: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
  CANCELLED: "bg-slate-200 text-slate-600",
};

function elapsed(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt) return "—";
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 1000));
  return `${seconds}s`;
}

const FAILURE_MESSAGES: Record<string, string> = {
  LOGIN_REQUIRED: "This source requires a user session. The read-only flow stopped.",
  CAPTCHA: "This source requested human verification. The flow stopped without trying to bypass it.",
  RATE_LIMITED: "The source limited requests. The flow was paused and can be retried later.",
  TIMEOUT: "The page did not reach a usable state within the allowed time.",
  NETWORK: "A network error interrupted the flow.",
  EXTRACTION_INCOMPLETE:
    "The page opened but critical job fields were not visible. The job was routed to review if retained.",
  POLICY_BLOCKED: "The source or action is not permitted by the current policy.",
  UNKNOWN: "The flow stopped unexpectedly.",
};

function FlowCard({ flow, onStop }: { flow: FlowSnapshot; onStop: (flowId: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const latestScreenshot = flow.screenshots[flow.screenshots.length - 1];
  const latestEvent = flow.events[0];
  const isTerminal = ["COMPLETE", "FAILED", "CANCELLED"].includes(flow.status);

  return (
    <div className="card overflow-hidden">
      {latestScreenshot ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/screenshots/${latestScreenshot.id}`}
          alt={latestScreenshot.stepLabel}
          className="h-40 w-full border-b border-slate-100 object-cover object-top"
        />
      ) : (
        <div className="flex h-40 w-full items-center justify-center border-b border-slate-100 bg-slate-50 text-xs text-slate-400">
          No screenshot yet
        </div>
      )}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <p className="font-medium">{flow.title}</p>
          <span className={`badge ${STATUS_STYLE[flow.status] ?? "bg-slate-100 text-slate-600"}`}>
            {flow.status}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {elapsed(flow.startedAt, flow.finishedAt)} · {latestEvent?.label ?? "Waiting to start"}
        </p>

        <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
          <Stat label="Found" value={flow.jobsDiscovered} />
          <Stat label="Apply" value={flow.jobsApplyCandidate} tone="text-green-700" />
          <Stat label="Review" value={flow.jobsReviewRequired} tone="text-amber-700" />
          <Stat label="Skip" value={flow.jobsSkipped} tone="text-slate-500" />
        </div>

        {flow.failureCategory && (
          <p className="mt-2 text-xs text-red-600">
            {FAILURE_MESSAGES[flow.failureCategory] ?? FAILURE_MESSAGES.UNKNOWN}
          </p>
        )}

        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-indigo-600 hover:underline"
          >
            {expanded ? "Hide timeline" : "Show timeline"}
          </button>
          {!isTerminal && (
            <button
              onClick={() => onStop(flow.id)}
              className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
            >
              Stop flow
            </button>
          )}
        </div>

        {expanded && (
          <div className="mt-2 border-t border-slate-100 pt-2">
            {flow.screenshots.length > 1 && (
              <div className="mb-2 flex gap-1 overflow-x-auto">
                {flow.screenshots.map((shot, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={shot.id}
                    src={`/api/screenshots/${shot.id}`}
                    alt={shot.stepLabel}
                    title={`${i + 1}. ${shot.stepLabel}`}
                    className="h-14 w-20 flex-none rounded border border-slate-200 object-cover"
                  />
                ))}
              </div>
            )}
            <ul className="flex flex-col gap-1 text-xs text-slate-500">
              {flow.events.map((event) => (
                <li key={event.id}>
                  <span className="font-mono text-slate-400">{event.kind}</span> — {event.label}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <p className={`font-semibold ${tone ?? "text-slate-700"}`}>{value}</p>
      <p className="text-slate-400">{label}</p>
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
        // ignore malformed frame
      }
    };
    source.addEventListener("done", () => source.close());
    source.onerror = () => {
      // EventSource retries automatically; nothing to do here.
    };
    return () => source.close();
  }, [runId]);

  const totals = useMemo(
    () =>
      run.flows.reduce(
        (acc, f) => ({
          discovered: acc.discovered + f.jobsDiscovered,
          normalized: acc.normalized + f.jobsNormalized,
          apply: acc.apply + f.jobsApplyCandidate,
          review: acc.review + f.jobsReviewRequired,
          skip: acc.skip + f.jobsSkipped,
        }),
        { discovered: 0, normalized: 0, apply: 0, review: 0, skip: 0 },
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
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Research run</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">{run.userGoal}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="badge bg-slate-100 text-slate-600">{run.status}</span>
            {!isTerminal && (
              <button
                onClick={handleStopAll}
                className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
              >
                Stop all
              </button>
            )}
          </div>
        </div>
      </div>

      {isTerminal && (
        <div className="card p-5">
          <h2 className="text-sm font-medium text-slate-700">Run complete</h2>
          <p className="mt-2 text-sm text-slate-600">
            {totals.discovered} job records discovered · {totals.normalized} normalized ·{" "}
            <span className="font-medium text-green-700">{totals.apply} strong apply candidates</span> ·{" "}
            <span className="font-medium text-amber-700">{totals.review} need review</span> ·{" "}
            {totals.skip} skipped by policy.
          </p>
          <Link href="/desk" className="mt-2 inline-block text-sm text-indigo-600 hover:underline">
            Open Daily Desk →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {run.flows.map((flow) => (
          <FlowCard key={flow.id} flow={flow} onStop={handleStopFlow} />
        ))}
      </div>
    </div>
  );
}
