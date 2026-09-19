import { NextResponse } from "next/server";
import {
  generateAndVerifyCoverLetter,
  JobNotFoundError,
  NoEvidenceMatchesError,
} from "@/server/coverLetter/pipeline";

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  try {
    const draft = await generateAndVerifyCoverLetter(jobId);
    return NextResponse.json(draft);
  } catch (error) {
    if (error instanceof JobNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof NoEvidenceMatchesError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
