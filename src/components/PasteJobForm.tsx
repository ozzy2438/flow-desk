"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const WORKPLACE_TYPES = ["UNKNOWN", "REMOTE", "HYBRID", "ONSITE"];
const EMPLOYMENT_TYPES = ["UNKNOWN", "FULL_TIME", "PART_TIME", "CONTRACT", "CASUAL", "FIXED_TERM"];
const SENIORITIES = ["UNKNOWN", "ENTRY", "MID", "SENIOR", "LEAD"];

function splitCsvField(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function PasteJobForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setMessage(null);

    const payload = {
      source: (form.get("source") as string) || "MANUAL_PASTE",
      sourceUrl: (form.get("sourceUrl") as string) || undefined,
      title: form.get("title") as string,
      company: (form.get("company") as string) || undefined,
      location: (form.get("location") as string) || undefined,
      workplaceType: (form.get("workplaceType") as string) || "UNKNOWN",
      employmentType: (form.get("employmentType") as string) || "UNKNOWN",
      seniority: (form.get("seniority") as string) || "UNKNOWN",
      salaryMin: form.get("salaryMin") ? Number(form.get("salaryMin")) : undefined,
      salaryMax: form.get("salaryMax") ? Number(form.get("salaryMax")) : undefined,
      salaryCurrency: (form.get("salaryCurrency") as string) || undefined,
      descriptionRaw: form.get("descriptionRaw") as string,
      requiredSkills: splitCsvField((form.get("requiredSkills") as string) || ""),
      preferredSkills: splitCsvField((form.get("preferredSkills") as string) || ""),
      visaRequirements: splitCsvField((form.get("visaRequirements") as string) || ""),
      ingestSource: "PASTED",
    };

    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage({ tone: "error", text: body.error ?? "Could not evaluate this job." });
        return;
      }
      router.push(`/jobs/${body.id}`);
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-700">Paste a LinkedIn, SEEK or other job</h3>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-indigo-600 hover:text-indigo-800"
        >
          {expanded ? "Hide fields" : "Show all fields"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <input name="title" placeholder="Job title *" required className="rounded-md border border-slate-300 p-2 text-sm" />
        <input name="company" placeholder="Company" className="rounded-md border border-slate-300 p-2 text-sm" />
        <input name="location" placeholder="Location" className="rounded-md border border-slate-300 p-2 text-sm" />
        <input name="sourceUrl" placeholder="Source URL" className="rounded-md border border-slate-300 p-2 text-sm" />
      </div>

      <textarea
        name="descriptionRaw"
        placeholder="Paste the job description *"
        required
        rows={5}
        className="rounded-md border border-slate-300 p-2 text-sm"
      />

      {expanded && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <select name="workplaceType" className="rounded-md border border-slate-300 p-2 text-sm">
            {WORKPLACE_TYPES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select name="employmentType" className="rounded-md border border-slate-300 p-2 text-sm">
            {EMPLOYMENT_TYPES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select name="seniority" className="rounded-md border border-slate-300 p-2 text-sm">
            {SENIORITIES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <input name="salaryMin" type="number" placeholder="Salary min" className="rounded-md border border-slate-300 p-2 text-sm" />
          <input name="salaryMax" type="number" placeholder="Salary max" className="rounded-md border border-slate-300 p-2 text-sm" />
          <input name="salaryCurrency" placeholder="Currency (e.g. AUD)" className="rounded-md border border-slate-300 p-2 text-sm" />
          <input
            name="requiredSkills"
            placeholder="Required skills (comma-separated)"
            className="rounded-md border border-slate-300 p-2 text-sm md:col-span-3"
          />
          <input
            name="preferredSkills"
            placeholder="Preferred skills (comma-separated)"
            className="rounded-md border border-slate-300 p-2 text-sm md:col-span-3"
          />
          <input
            name="visaRequirements"
            placeholder="Visa / work-rights language (comma-separated)"
            className="rounded-md border border-slate-300 p-2 text-sm md:col-span-3"
          />
        </div>
      )}

      <p className="text-xs text-slate-400">
        Fields left blank are stored as unknown, never guessed. Unknown fields are never treated
        as a reason to block a posting.
      </p>

      {message && (
        <p className={message.tone === "ok" ? "text-sm text-green-700" : "text-sm text-red-600"}>
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "Evaluating…" : "Evaluate job"}
      </button>
    </form>
  );
}
