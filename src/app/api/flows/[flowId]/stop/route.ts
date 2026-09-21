import { NextResponse } from "next/server";
import { stopFlow } from "@/server/browser/stop";

export async function POST(_request: Request, { params }: { params: Promise<{ flowId: string }> }) {
  const { flowId } = await params;
  await stopFlow(flowId);
  return NextResponse.json({ ok: true });
}
