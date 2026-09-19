import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { importCandidateProfile } from "@/server/profile/importProfile";

export async function POST(request: Request) {
  const form = await request.formData();
  const profileFile = form.get("profileCsv");
  const schemaFile = form.get("schemaCsv");

  if (!(profileFile instanceof File) || !(schemaFile instanceof File)) {
    return NextResponse.json(
      { error: "Both candidate-profile.csv and candidate-profile.schema.csv are required." },
      { status: 400 },
    );
  }

  const user = await getCurrentUser();
  const result = await importCandidateProfile({
    userId: user.id,
    profileCsvText: await profileFile.text(),
    schemaCsvText: await schemaFile.text(),
  });

  return NextResponse.json(result, { status: result.status === "VALID" ? 200 : 422 });
}
