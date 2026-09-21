import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { evaluateAndPersistJob, PolicyNotConfiguredError } from "@/server/jobs/evaluate";
import { normalizeJobInput } from "@/server/jobs/normalize";
import {
  importPublicJobUrl,
  JobSourceFetchError,
  UnsupportedJobUrlError,
} from "@/server/jobs/urlImport";

const requestSchema = z.object({ url: z.string().url() });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid job URL." }, { status: 400 });
  }

  try {
    const user = await getCurrentUser();
    const raw = await importPublicJobUrl(parsed.data.url);
    if (
      raw.applicationDeadline &&
      new Date(raw.applicationDeadline).getTime() < Date.now()
    ) {
      return NextResponse.json(
        {
          error: "The public source reports that this job's application deadline has passed.",
          code: "SOURCE_CLOSED",
        },
        { status: 422 },
      );
    }
    const { job, duplicate } = await evaluateAndPersistJob(normalizeJobInput(raw), user.id);
    return NextResponse.json({
      id: job.id,
      decision: job.evaluation?.decision,
      duplicateOf: duplicate?.id ?? null,
    });
  } catch (error) {
    if (error instanceof UnsupportedJobUrlError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 422 });
    }
    if (error instanceof JobSourceFetchError) {
      return NextResponse.json({ error: error.message, code: "SOURCE_FETCH_FAILED" }, { status: 502 });
    }
    if (error instanceof PolicyNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "The public source returned a job payload that did not match its documented shape." },
        { status: 502 },
      );
    }
    throw error;
  }
}
