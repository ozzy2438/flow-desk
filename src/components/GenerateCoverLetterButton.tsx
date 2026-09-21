"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function GenerateCoverLetterButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/cover-letter/${jobId}`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not generate a draft.");
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={handleClick}
        disabled={pending}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "Generating…" : "Generate draft"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
