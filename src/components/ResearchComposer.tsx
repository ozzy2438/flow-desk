"use client";

import { ArrowUp, CircleNotch } from "@phosphor-icons/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

const EXAMPLE_GOAL = "Research Melbourne and remote applied AI engineering roles";

export function ResearchComposer() {
  const router = useRouter();
  const [goal, setGoal] = useState("");
  const [flowCount, setFlowCount] = useState(3);
  const [deviceMode, setDeviceMode] = useState<"DESKTOP" | "MOBILE_WEB">("DESKTOP");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const researchGoal = goal.trim();
    if (researchGoal.length < 10) {
      setError("Describe what you want to research in a little more detail.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: researchGoal,
          requestedFlowCount: flowCount,
          deviceMode,
          sourceUrls: supportedBoardUrls(researchGoal),
          sourceOptions: {
            linkedIn: /\blinked\s?in\b/i.test(researchGoal),
            seek: /\bseek\b/i.test(researchGoal),
          },
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
    <form onSubmit={handleSubmit} className="research-composer">
      <label htmlFor="goal" className="sr-only">
        What do you want to research?
      </label>
      <textarea
        id="goal"
        value={goal}
        onChange={(event) => setGoal(event.target.value)}
        placeholder={EXAMPLE_GOAL}
        rows={2}
        autoFocus
        className="research-input"
      />

      <div className="research-controls">
        <div className="flow-control">
          <label htmlFor="flowCount">Flows</label>
          <span>{flowCount}</span>
          <input
            id="flowCount"
            type="range"
            min={1}
            max={10}
            value={flowCount}
            onChange={(event) => setFlowCount(Number(event.target.value))}
            aria-label={`Run ${flowCount} parallel research flows`}
          />
        </div>

        <div className="device-toggle" aria-label="Browser viewport">
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

        <button
          type="submit"
          disabled={submitting}
          className="research-submit"
          aria-label={submitting ? "Planning research" : "Start research"}
        >
          {submitting ? <CircleNotch size={18} className="animate-spin" /> : <ArrowUp size={18} weight="bold" />}
        </button>
      </div>

      {error && <p className="research-error">{error}</p>}
    </form>
  );
}

function supportedBoardUrls(value: string): string[] {
  const matches = value.match(/https:\/\/[^\s]+/g) ?? [];
  return [
    ...new Set(
      matches
        .map((match) => match.replace(/[),.;]+$/, ""))
        .filter((match) => {
          try {
            const host = new URL(match).hostname.toLowerCase();
            return [
              "boards.greenhouse.io",
              "job-boards.greenhouse.io",
              "boards-api.greenhouse.io",
              "jobs.lever.co",
              "jobs.eu.lever.co",
              "api.lever.co",
              "api.eu.lever.co",
            ].includes(host);
          } catch {
            return false;
          }
        }),
    ),
  ];
}
