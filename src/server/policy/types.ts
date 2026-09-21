import { z } from "zod";

/**
 * decision-policy.csv has no separate schema file (unlike the candidate
 * profile), so this is the canonical column contract the importer enforces.
 * It is documented in data/README.md for the operator dropping the file in.
 */
export const POLICY_CATEGORIES = [
  "ROLE_EXCLUSION",
  "LOCATION",
  "WORK_RIGHTS",
  "COMPENSATION",
  "EMPLOYMENT_BASIS",
  "SENIORITY",
  "DUPLICATE",
  "DEEP_REVIEW",
  "EVIDENCE_GAP",
  "CLAIM_POLICY",
  "OTHER",
] as const;
export type PolicyCategory = (typeof POLICY_CATEGORIES)[number];

export const POLICY_OPERATORS = [
  "EQUALS",
  "NOT_EQUALS",
  "CONTAINS",
  "NOT_CONTAINS",
  "IN",
  "NOT_IN",
  "LESS_THAN",
  "GREATER_THAN",
  "IS_UNKNOWN",
  "ALWAYS",
] as const;
export type PolicyOperator = (typeof POLICY_OPERATORS)[number];

export const POLICY_ACTIONS = ["HARD_BLOCK", "BOOST", "PENALTY", "REVIEW", "NEUTRAL"] as const;
export type PolicyActionValue = (typeof POLICY_ACTIONS)[number];

export const policyRuleRowSchema = z.object({
  rule_code: z.string().min(1),
  category: z.enum(POLICY_CATEGORIES),
  field: z.string().min(1),
  operator: z.enum(POLICY_OPERATORS),
  value: z.string().default(""),
  action: z.enum(POLICY_ACTIONS),
  reason: z.string().min(1),
  active: z.enum(["TRUE", "FALSE"]).default("TRUE"),
});

export type PolicyRuleRow = z.infer<typeof policyRuleRowSchema>;

export type ImportIssue = { rowIndex: number; message: string };
