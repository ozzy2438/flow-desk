import { NextResponse } from "next/server";
import { stopResearchRun } from "@/server/browser/stop";

export async function POST(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  await stopResearchRun(runId);
  return NextResponse.json({ ok: true });
}
