import { db } from "../db";
import { parseCsv } from "../csv/parseCsv";
import { policyRuleRowSchema, type ImportIssue } from "./types";

export type ImportPolicyInput = {
  userId: string;
  policyCsvText: string;
};

export type ImportPolicyResult = {
  importId: string;
  version: number;
  status: "VALID" | "INVALID";
  rowCount: number;
  errorCount: number;
  errors: ImportIssue[];
};

export async function importDecisionPolicy({
  userId,
  policyCsvText,
}: ImportPolicyInput): Promise<ImportPolicyResult> {
  const errors: ImportIssue[] = [];
  const parsed = parseCsv(policyCsvText);
  errors.push(...parsed.errors);

  const seenCodes = new Set<string>();
  const rules = parsed.rows
    .map((row, rowIndex) => {
      const result = policyRuleRowSchema.safeParse(row);
      if (!result.success) {
        errors.push({
          rowIndex,
          message: `row ${rowIndex + 1}: ${result.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(", ")}`,
        });
        return null;
      }
      if (seenCodes.has(result.data.rule_code)) {
        errors.push({
          rowIndex,
          message: `row ${rowIndex + 1}: duplicate rule_code "${result.data.rule_code}"`,
        });
        return null;
      }
      seenCodes.add(result.data.rule_code);
      return { rowIndex, row: result.data };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const status: "VALID" | "INVALID" = errors.length > 0 ? "INVALID" : "VALID";

  const lastImport = await db.decisionPolicyImport.findFirst({
    where: { userId },
    orderBy: { version: "desc" },
  });
  const nextVersion = (lastImport?.version ?? 0) + 1;

  const created = await db.$transaction(async (tx) => {
    if (status === "VALID") {
      await tx.decisionPolicyImport.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false },
      });
    }

    return tx.decisionPolicyImport.create({
      data: {
        userId,
        version: nextVersion,
        sourceFileHash: parsed.hash,
        status,
        rowCount: parsed.rows.length,
        errorCount: errors.length,
        errors: errors as unknown as object[],
        isActive: status === "VALID",
        rules:
          status === "VALID"
            ? {
                create: rules.map(({ rowIndex, row }) => ({
                  rowIndex,
                  code: row.rule_code,
                  category: row.category,
                  field: row.field,
                  operator: row.operator,
                  value: row.value,
                  action: row.action,
                  reason: row.reason,
                  active: row.active === "TRUE",
                  raw: row as object,
                })),
              }
            : undefined,
      },
    });
  });

  return {
    importId: created.id,
    version: created.version,
    status,
    rowCount: parsed.rows.length,
    errorCount: errors.length,
    errors,
  };
}

export async function getActivePolicyImport(userId: string) {
  return db.decisionPolicyImport.findFirst({
    where: { userId, isActive: true },
    include: { rules: { orderBy: { rowIndex: "asc" } } },
  });
}
