import { createHash } from "node:crypto";
import { db } from "../db";
import type { ImportIssue } from "./types";
import type { PolicyActionValue } from "./types";

export type ImportPolicyJsonInput = {
  userId: string;
  policyJsonText: string;
};

export type ImportPolicyJsonResult = {
  importId: string;
  version: number;
  status: "VALID" | "INVALID";
  rowCount: number;
  errorCount: number;
  errors: ImportIssue[];
};

type RawRecord = Record<string, unknown>;

type RuleDraft = {
  code: string;
  category: string;
  field: string;
  operator: string;
  value: string;
  action: PolicyActionValue;
  reason: string;
  raw: RawRecord;
};

/**
 * A small, fixed set of pattern matchers for the free-text hard_constraints
 * this operator's real decision-policy.json states (relocation, clearance,
 * postgrad requirement, professional licence). These are deliberately
 * conservative and hand-coded rather than left to the demo decision
 * provider's keyword heuristic: a hard blocker must be something the engine
 * can actually execute deterministically, not something a semantic guess
 * gets to decide. A constraint that doesn't match any known pattern routes
 * to DEEP_REVIEW instead of being silently dropped or wrongly auto-blocked.
 */
function matchHardConstraintPattern(blockerText: string): RuleDraft | null {
  const text = blockerText.toLowerCase();

  if (text.includes("relocat")) {
    return {
      code: "HC_RELOCATION",
      category: "LOCATION",
      field: "descriptionRaw",
      operator: "CONTAINS",
      value: "must relocate|relocation required|relocate to",
      action: "HARD_BLOCK",
      reason: blockerText,
      raw: {},
    };
  }
  if (text.includes("clearance")) {
    return {
      code: "HC_CLEARANCE",
      category: "WORK_RIGHTS",
      field: "visaRequirements",
      operator: "CONTAINS",
      value: "security clearance|clearance required|baseline clearance|NV1|NV2|TS clearance",
      action: "HARD_BLOCK",
      reason: blockerText,
      raw: {},
    };
  }
  if (text.includes("postgraduate") || text.includes("master") || text.includes("phd")) {
    return {
      code: "HC_POSTGRAD",
      category: "OTHER",
      field: "descriptionRaw",
      operator: "CONTAINS",
      value: "master's degree required|phd required|postgraduate qualification required",
      action: "HARD_BLOCK",
      reason: blockerText,
      raw: {},
    };
  }
  if (text.includes("licence") || text.includes("license") || text.includes("registration")) {
    return {
      code: "HC_LICENCE",
      category: "OTHER",
      field: "descriptionRaw",
      operator: "CONTAINS",
      value: "must hold a current licence|professional registration required",
      action: "HARD_BLOCK",
      reason: blockerText,
      raw: {},
    };
  }
  return null;
}

/**
 * Native import for the richer "Apply OS" decision-policy.json - natural-
 * language hard/soft constraints and a ranking policy, not the flat CSV
 * MVP's field/operator/value rows. There is no separate schema file for
 * this one (unlike the profile), so validation here is structural
 * (required top-level sections present) rather than full JSON Schema.
 *
 * Concrete, recognizable hard_constraints map to real PolicyRule rows via
 * matchHardConstraintPattern (see there for why - free text can't be
 * executed as a deterministic rule without a known pattern). Everything
 * else - soft_preferences, ranking_policy.boost_signals - is translatable
 * fairly directly into the existing BOOST/PENALTY/REVIEW vocabulary and
 * is imported in full.
 */
export async function importDecisionPolicyJson({
  userId,
  policyJsonText,
}: ImportPolicyJsonInput): Promise<ImportPolicyJsonResult> {
  const errors: ImportIssue[] = [];

  let policy: RawRecord;
  try {
    policy = JSON.parse(policyJsonText);
  } catch (err) {
    return {
      importId: "",
      version: 0,
      status: "INVALID",
      rowCount: 0,
      errorCount: 1,
      errors: [{ rowIndex: -1, message: `decision-policy.json is not valid JSON: ${(err as Error).message}` }],
    };
  }

  const REQUIRED_SECTIONS = ["hard_constraints", "soft_preferences", "triage_policy", "claim_use_policy"];
  for (const section of REQUIRED_SECTIONS) {
    if (!(section in policy)) {
      errors.push({ rowIndex: -1, message: `Missing required top-level section "${section}".` });
    }
  }

  const status: "VALID" | "INVALID" = errors.length > 0 ? "INVALID" : "VALID";
  const hash = createHash("sha256").update(policyJsonText).digest("hex");

  const lastImport = await db.decisionPolicyImport.findFirst({
    where: { userId },
    orderBy: { version: "desc" },
  });
  const nextVersion = (lastImport?.version ?? 0) + 1;

  const rules: RuleDraft[] = [];

  if (status === "VALID") {
    // --- Hard constraints ---
    const hardConstraints = (policy.hard_constraints as RawRecord)?.blockers as RawRecord[] | undefined;
    (hardConstraints ?? []).forEach((blocker, i) => {
      const text = (blocker.blocker as string) ?? "";
      const matched = matchHardConstraintPattern(text);
      if (matched) {
        rules.push({ ...matched, raw: blocker });
      } else {
        rules.push({
          code: `HC_REVIEW_${i + 1}`,
          category: "DEEP_REVIEW",
          field: "descriptionRaw",
          operator: "ALWAYS",
          value: "",
          action: "REVIEW",
          reason: `Unmatched hard constraint pattern, routed to review instead of guessed: "${text}"`,
          raw: blocker,
        });
      }
    });

    // --- Soft preferences: employment basis ---
    const employmentBasis = (policy.soft_preferences as RawRecord)?.employment_basis as RawRecord | undefined;
    const acceptableBasis = (employmentBasis?.acceptable as string[]) ?? [];
    if (acceptableBasis.length > 0) {
      const basisMap: Record<string, string> = {
        permanent: "FULL_TIME",
        "fixed-term": "FIXED_TERM",
        contract: "CONTRACT",
        "part-time": "PART_TIME",
      };
      const mapped = uniqueMap(acceptableBasis, basisMap);
      if (mapped.length > 0) {
        rules.push({
          code: "SP_EMPLOYMENT_BASIS_ACCEPTABLE",
          category: "EMPLOYMENT_BASIS",
          field: "employmentType",
          operator: "IN",
          value: mapped.join("|"),
          action: "BOOST",
          reason: `Matches an acceptable employment basis: ${acceptableBasis.join(", ")}.`,
          raw: employmentBasis ?? {},
        });
      }
    }

    // --- Soft preferences: seniority ---
    const seniority = (policy.soft_preferences as RawRecord)?.seniority as RawRecord | undefined;
    const excludedLevels = (seniority?.excluded_levels as string[]) ?? [];
    if (excludedLevels.some((l) => /graduate|intern|entry/i.test(l))) {
      rules.push({
        code: "SP_SENIORITY_EXCLUDED",
        category: "SENIORITY",
        field: "seniority",
        operator: "EQUALS",
        value: "ENTRY",
        action: "PENALTY",
        reason: `Below target seniority levels (excludes: ${excludedLevels.join(", ")}). Not an automatic reject per this policy's own triage rules.`,
        raw: seniority ?? {},
      });
    }

    // --- Soft preferences: freeform items (direction + weight_hint) ---
    const items = ((policy.soft_preferences as RawRecord)?.items as RawRecord[]) ?? [];
    items.forEach((item, i) => {
      const direction = item.direction as string;
      const preference = item.preference as string;
      const weight = item.weight_hint as string;
      rules.push({
        code: `SP_ITEM_${i + 1}`,
        category: "OTHER",
        field: "descriptionRaw",
        operator: "CONTAINS",
        value: extractKeywordsForPreference(preference),
        action: direction === "prefer" ? "BOOST" : "PENALTY",
        reason: `${preference} (${direction}, weight: ${weight ?? "unspecified"}).`,
        raw: item,
      });
    });

    // --- Ranking boost signals (tied to capability patterns, keyword-driven) ---
    const boostSignals = ((policy.ranking_policy as RawRecord)?.boost_signals as RawRecord[]) ?? [];
    boostSignals.forEach((signal, i) => {
      rules.push({
        code: `RANK_BOOST_${i + 1}`,
        category: "OTHER",
        field: "descriptionRaw",
        operator: "ALWAYS",
        value: "",
        action: "BOOST",
        reason: `${signal.when} (pattern ${signal.based_on_pattern ?? "n/a"}, boost: ${signal.boost}). Evaluated against evidence match, not literal job text - imported for audit; not auto-applied as a job-field rule.`,
        raw: signal,
      });
    });

    // --- Claim policy forbidden claims, as CLAIM_POLICY rows the cover-letter
    //     verifier reads (never applied against a job posting - see engine.ts) ---
    const forbiddenClaims = ((policy.claim_use_policy as RawRecord)?.avoid as string[]) ?? [];
    forbiddenClaims.forEach((claim, i) => {
      rules.push({
        code: `CLAIM_FORBIDDEN_${i + 1}`,
        category: "CLAIM_POLICY",
        field: "claim_text",
        operator: "ALWAYS",
        value: "",
        action: "HARD_BLOCK",
        reason: claim,
        raw: { claim },
      });
    });

    // --- Full source document, preserved for audit (never applied as a rule) ---
    rules.push({
      code: "_SOURCE_DOCUMENT",
      category: "OTHER",
      field: "n/a",
      operator: "ALWAYS",
      value: "",
      action: "NEUTRAL",
      reason: "Full decision-policy.json, kept for audit/reference.",
      raw: { active_discovery_targets: policy.active_discovery_targets, compensation_policy: policy.compensation_policy, application_strategy: policy.application_strategy, human_review_rules: policy.human_review_rules },
    });
  }

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
        sourceFileHash: hash,
        status,
        rowCount: rules.length,
        errorCount: errors.length,
        errors: errors as unknown as object[],
        isActive: status === "VALID",
        rules:
          status === "VALID"
            ? {
                create: rules.map((rule, rowIndex) => ({
                  rowIndex,
                  code: rule.code,
                  category: rule.category,
                  field: rule.field,
                  operator: rule.operator,
                  value: rule.value,
                  action: rule.action as never,
                  reason: rule.reason,
                  // The audit-only source-document row is never evaluated
                  // against a job (would otherwise show up as a NEUTRAL
                  // signal on every single evaluation).
                  active: rule.code !== "_SOURCE_DOCUMENT",
                  raw: rule.raw as object,
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
    rowCount: rules.length,
    errorCount: errors.length,
    errors,
  };
}

function uniqueMap(values: string[], map: Record<string, string>): string[] {
  const out = new Set<string>();
  for (const v of values) {
    const mapped = map[v.toLowerCase()];
    if (mapped) out.add(mapped);
  }
  return [...out];
}

function extractKeywordsForPreference(preference: string): string {
  // A light heuristic: pull the domain nouns out of the preference sentence
  // as CONTAINS-matchable keywords rather than requiring the operator to
  // hand-author a separate keyword list per item.
  const stopwords = new Set(["a", "an", "the", "of", "for", "with", "rather", "than", "over", "on", "in", "to", "or", "and"]);
  return preference
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopwords.has(w))
    .slice(0, 6)
    .join("|");
}
