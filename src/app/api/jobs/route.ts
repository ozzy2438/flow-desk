import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { rawJobInputSchema } from "@/server/jobs/types";
import { normalizeJobInput } from "@/server/jobs/normalize";
import { evaluateAndPersistJob, PolicyNotConfiguredError } from "@/server/jobs/evaluate";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = rawJobInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid job payload.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const user = await getCurrentUser();
  const normalized = normalizeJobInput(parsed.data);

  try {
    const { job, duplicate } = await evaluateAndPersistJob(normalized, user.id);
    return NextResponse.json({ id: job.id, decision: job.evaluation?.decision, duplicateOf: duplicate?.id ?? null });
  } catch (error) {
    if (error instanceof PolicyNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
