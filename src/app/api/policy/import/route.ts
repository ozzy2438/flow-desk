import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { importDecisionPolicy } from "@/server/policy/importPolicy";
import { importDecisionPolicyJson } from "@/server/policy/importPolicyJson";

export async function POST(request: Request) {
  const form = await request.formData();
  const policyJsonFile = form.get("policyJson");
  const policyFile = form.get("policyCsv");

  const user = await getCurrentUser();

  if (policyJsonFile instanceof File) {
    const result = await importDecisionPolicyJson({
      userId: user.id,
      policyJsonText: await policyJsonFile.text(),
    });

    return NextResponse.json(result, { status: result.status === "VALID" ? 200 : 422 });
  }

  if (!(policyFile instanceof File)) {
    return NextResponse.json(
      { error: "decision-policy.json or decision-policy.csv is required." },
      { status: 400 },
    );
  }

  const result = await importDecisionPolicy({
    userId: user.id,
    policyCsvText: await policyFile.text(),
  });

  return NextResponse.json(result, { status: result.status === "VALID" ? 200 : 422 });
}
