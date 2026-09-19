import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { importCandidateProfile } from "@/server/profile/importProfile";
import { importCandidateProfileJson } from "@/server/profile/importProfileJson";

export async function POST(request: Request) {
  const form = await request.formData();
  const profileJsonFile = form.get("profileJson");
  const schemaJsonFile = form.get("schemaJson");
  const profileFile = form.get("profileCsv");
  const schemaFile = form.get("schemaCsv");

  const user = await getCurrentUser();

  if (profileJsonFile instanceof File || schemaJsonFile instanceof File) {
    if (!(profileJsonFile instanceof File) || !(schemaJsonFile instanceof File)) {
      return NextResponse.json(
        { error: "Both candidate-profile.json and candidate-profile.schema.json are required." },
        { status: 400 },
      );
    }

    const result = await importCandidateProfileJson({
      userId: user.id,
      profileJsonText: await profileJsonFile.text(),
      schemaJsonText: await schemaJsonFile.text(),
    });

    return NextResponse.json(result, { status: result.status === "VALID" ? 200 : 422 });
  }

  if (!(profileFile instanceof File) || !(schemaFile instanceof File)) {
    return NextResponse.json(
      { error: "Both candidate-profile.csv and candidate-profile.schema.csv are required." },
      { status: 400 },
    );
  }

  const result = await importCandidateProfile({
    userId: user.id,
    profileCsvText: await profileFile.text(),
    schemaCsvText: await schemaFile.text(),
  });

  return NextResponse.json(result, { status: result.status === "VALID" ? 200 : 422 });
}
