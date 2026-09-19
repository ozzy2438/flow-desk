import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { importDecisionPolicy } from "@/server/policy/importPolicy";

export async function POST(request: Request) {
  const form = await request.formData();
  const policyFile = form.get("policyCsv");

  if (!(policyFile instanceof File)) {
    return NextResponse.json({ error: "decision-policy.csv is required." }, { status: 400 });
  }

  const user = await getCurrentUser();
  const result = await importDecisionPolicy({
    userId: user.id,
    policyCsvText: await policyFile.text(),
  });

  return NextResponse.json(result, { status: result.status === "VALID" ? 200 : 422 });
}
