"use client";

import { ArrowLeft, CircleNotch, StopCircle, X } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type FlowEvent = {
  id: string;
  kind: string;
  label: string;
  createdAt: string;
};

type FlowSnapshot = {
  id: string;
  source: string;
  title: string;
  startUrl: string;
  goal: string;
  status: string;
  failureCategory: string | null;
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

const TERMINAL_RUN_STATUSES = new Set(["COMPLETED", "CANCELLED", "PARTIAL_FAILURE", "FAILED"]);
const TERMINAL_FLOW_STATUSES = new Set(["COMPLETE", "FAILED", "CANCELLED"]);

const FLOW_STATUS_LABEL: Record<string, string> = {
  QUEUED: "Waiting",
  OPENING_BROWSER: "Opening browser",
  OPEN_PAGE: "Opening page",
  SEARCHING: "Researching",
  OPENING_JOB_DETAIL: "Navigating",
  EXTRACTING: "Reading result",
  EVALUATING: "Finishing",
  COMPLETE: "Complete",
  FAILED: "Stopped",
  CANCELLED: "Stopped",
};

export function RunDashboard({ runId, initialRun }: { runId: string; initialRun: RunSnapshot }) {
  const [run, setRun] = useState<RunSnapshot>(initialRun);
  const [holdPlanOpen, setHoldPlanOpen] = useState(!TERMINAL_RUN_STATUSES.has(initialRun.status));
  const hasAnyScreens = run.flows.some((flow) => flow.screenshots.length > 0);

  useEffect(() => {
    const source = new EventSource(`/api/runs/${runId}/events`);
    source.onmessage = (event) => {
      try {
        setRun(JSON.parse(event.data) as RunSnapshot);
      } catch {
        // Keep the last verified state if a stream frame is malformed.
      }
    };
    source.addEventListener("done", () => source.close());
    return () => source.close();
  }, [runId]);

  useEffect(() => {
    if (!holdPlanOpen || !hasAnyScreens) return;
    const timer = window.setTimeout(() => setHoldPlanOpen(false), 3000);
    return () => window.clearTimeout(timer);
  }, [holdPlanOpen, hasAnyScreens]);

  const automaticFlows = useMemo(
    () => run.flows.filter((flow) => flow.failureCategory !== "LOGIN_REQUIRED"),
    [run.flows],
  );
  const handoffFlows = useMemo(
    () => run.flows.filter((flow) => flow.failureCategory === "LOGIN_REQUIRED"),
    [run.flows],
  );
  const screenCount = automaticFlows.reduce((sum, flow) => sum + flow.screenshots.length, 0);
  const isTerminal = TERMINAL_RUN_STATUSES.has(run.status);
  const planExpanded = holdPlanOpen || (screenCount === 0 && !isTerminal);
  const phase = isTerminal ? "Complete" : planExpanded ? "Planning" : "Researching";

  async function stopAll() {
    await fetch(`/api/runs/${runId}/stop`, { method: "POST" });
  }

  return (
    <div className="run-page">
      <div className="run-shell">
        <Link href="/" className="new-research-link">
          <ArrowLeft size={15} weight="bold" />
          New research
        </Link>

        <section className="run-prompt" aria-label="Active research request">
          <p>{run.userGoal}</p>
          <div className="run-prompt-controls">
            <div className="flow-control is-locked">
              <span>Flows</span>
              <strong>{run.flows.length}</strong>
              <input
                type="range"
                min={1}
                max={10}
                value={Math.max(1, run.flows.length)}
                disabled
                aria-label={`${run.flows.length} research flows`}
              />
            </div>
            <div className="device-toggle is-locked" aria-label="Selected browser viewport">
              <span className={!run.mode.endsWith("MOBILE_WEB") ? "is-active" : ""}>Desktop</span>
              <span className={run.mode.endsWith("MOBILE_WEB") ? "is-active" : ""}>Mobile web</span>
            </div>
            <div className="run-phase" aria-live="polite">
              {!isTerminal && <CircleNotch size={17} className="animate-spin" />}
              <span>{phase}</span>
              {!isTerminal && (
                <button type="button" onClick={stopAll} aria-label="Stop all research flows">
                  <StopCircle size={19} />
                </button>
              )}
            </div>
          </div>
        </section>

        {planExpanded ? (
          <section className="plan-section" aria-labelledby="plan-title">
            <h1 id="plan-title">{researchTitle(run.userGoal)}</h1>
            <p className="plan-summary">
              {run.flows.length} parallel browser flows are researching this request and capturing the useful steps.
            </p>
            <div className="plan-list">
              {run.flows.map((flow, index) => (
                <PlanRow key={flow.id} flow={flow} index={index} request={run.userGoal} />
              ))}
            </div>
          </section>
        ) : (
          <details className="compact-plan">
            <summary>
              <span>{researchTitle(run.userGoal)}</span>
              <small>{run.flows.length} flows planned</small>
            </summary>
            <div className="plan-list">
              {run.flows.map((flow, index) => (
                <PlanRow key={flow.id} flow={flow} index={index} request={run.userGoal} />
              ))}
            </div>
          </details>
        )}

        {automaticFlows.length > 0 && (
          <section className="live-section" aria-label="Live browser research">
            {automaticFlows.map((flow, index) => (
              <LiveFlow key={flow.id} flow={flow} index={index} />
            ))}
          </section>
        )}

        {handoffFlows.length > 0 && <SignedInSources flows={handoffFlows} />}

        {isTerminal && (
          <footer className="run-complete">
            <div>
              <p>Research complete</p>
              <span>
                {screenCount} useful screens captured across {automaticFlows.length} browser flows.
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/">Run another</Link>
              <Link href="/desk" className="primary-link">
                View results
              </Link>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}

function PlanRow({ flow, index, request }: { flow: FlowSnapshot; index: number; request: string }) {
  const manual = flow.failureCategory === "LOGIN_REQUIRED";
  const status = manual ? "Needs your browser" : FLOW_STATUS_LABEL[flow.status] ?? "Waiting";
  return (
    <article className="plan-row">
      <span className="plan-number">{index + 1}</span>
      <div className="min-w-0">
        <h2>{displayFlowTitle(flow, index)}</h2>
        <p className="plan-domain">{displayHost(flow.startUrl)}</p>
        <p className="plan-copy">
          {manual
            ? "Continue in your signed-in browser and capture the visible result."
            : `Research this source for “${shorten(request, 92)}”. Stop when a useful result is captured.`}
        </p>
      </div>
      <StatusPill label={status} active={!TERMINAL_FLOW_STATUSES.has(flow.status)} />
    </article>
  );
}

function LiveFlow({ flow, index }: { flow: FlowSnapshot; index: number }) {
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const selectedShot = flow.screenshots.find((shot) => shot.id === selectedShotId);
  const terminal = TERMINAL_FLOW_STATUSES.has(flow.status);
  const status = FLOW_STATUS_LABEL[flow.status] ?? "Researching";

  return (
    <article className="live-flow">
      <header className="live-flow-header">
        <div className="min-w-0">
          <h2>{displayFlowTitle(flow, index)}</h2>
          <p>{displayHost(flow.startUrl)}</p>
        </div>
        <StatusPill label={status} active={!terminal} />
      </header>

      <div className="live-screen-rail" aria-label={`${displayFlowTitle(flow, index)} screens`}>
        {flow.screenshots.length > 0
          ? flow.screenshots.map((shot, shotIndex) => (
              <button
                type="button"
                key={shot.id}
                className="live-screen"
                onClick={() => setSelectedShotId(shot.id)}
              >
                <div className="live-screen-image">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/screenshots/${shot.id}`} alt={shot.stepLabel} />
                  {!terminal && shotIndex === flow.screenshots.length - 1 && <span className="live-label">Live</span>}
                </div>
                <p>
                  <span>{shotIndex + 1}</span>
                  {plainStepLabel(shot.stepLabel)}
                </p>
              </button>
            ))
          : [0, 1, 2].map((placeholder) => (
              <div key={placeholder} className="live-screen is-loading" aria-hidden="true">
                <div className="live-screen-image" />
                <p>{placeholder === 0 ? status : "Waiting for browser"}</p>
              </div>
            ))}
      </div>

      {flow.failureCategory && flow.failureCategory !== "LOGIN_REQUIRED" && (
        <details className="flow-details">
          <summary>Why this flow stopped</summary>
          <p>{flow.events[0]?.label ?? "The browser could not continue safely."}</p>
        </details>
      )}

      {selectedShot && (
        <div
          className="screen-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={selectedShot.stepLabel}
          onClick={() => setSelectedShotId(null)}
        >
          <div className="screen-dialog-card" onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => setSelectedShotId(null)} aria-label="Close screenshot">
              <X size={19} weight="bold" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/screenshots/${selectedShot.id}`} alt={selectedShot.stepLabel} />
            <p>{plainStepLabel(selectedShot.stepLabel)}</p>
          </div>
        </div>
      )}
    </article>
  );
}

function SignedInSources({ flows }: { flows: FlowSnapshot[] }) {
  return (
    <details className="signed-in-sources">
      <summary>
        {flows.length} signed-in {flows.length === 1 ? "source needs" : "sources need"} your browser
      </summary>
      <div>
        {flows.map((flow, index) => (
          <p key={flow.id}>
            <span>{displayFlowTitle(flow, index)}</span>
            <Link href="/inbox">Capture visible result</Link>
          </p>
        ))}
      </div>
    </details>
  );
}

function StatusPill({ label, active }: { label: string; active: boolean }) {
  return (
    <span className="status-pill">
      <span className={active ? "status-dot is-active" : "status-dot"} />
      {label}
    </span>
  );
}

function displayFlowTitle(flow: FlowSnapshot, index: number): string {
  if (flow.source === "LINKEDIN_MANUAL") return "LinkedIn research";
  if (flow.source === "SEEK_MANUAL") return "SEEK research";
  if (flow.title.startsWith("Demo board")) {
    const suffix = flow.title.split("—")[1]?.trim();
    return suffix ? `${titleCase(suffix)} research` : `Research flow ${index + 1}`;
  }
  return flow.title.replace(" · attended capture", "");
}

function displayHost(value: string): string {
  try {
    const url = new URL(value);
    return url.hostname === "127.0.0.1" ? "Local research browser" : url.hostname.replace(/^www\./, "");
  } catch {
    return "Research source";
  }
}

function researchTitle(value: string): string {
  const cleaned = value.replace(/https:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "Research the request";
  return titleCase(shorten(cleaned, 82));
}

function plainStepLabel(value: string): string {
  return value
    .replace(/^Open source$/i, "Open page")
    .replace(/^Open job detail:\s*/i, "Open result · ")
    .replace(/^Search results for\s*/i, "Search · ");
}

function shorten(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 1).trim()}…` : value;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
