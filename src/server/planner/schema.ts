import { z } from "zod";
import { BROWSER_ACTION_KINDS } from "../browser/actions";
import { ALLOWED_DOMAINS } from "../browser/sourceRegistry";

/**
 * AGENCY_BRIEF.md Phase 2: "All planner output must pass Zod validation.
 * The application must reject disallowed domains, external actions, unsafe
 * stop conditions or unbounded flows." A candidate that fails this is
 * dropped before a DiscoveryFlow row is ever created - it never reaches
 * the queue.
 */
export const discoveryFlowCandidateSchema = z.object({
  source: z.string().min(1),
  title: z.string().min(1).max(120),
  startUrl: z.string().url(),
  goal: z.string().min(1).max(500),
  stopCondition: z.string().min(1).max(500),
  allowedDomains: z
    .array(z.string())
    .min(1)
    .refine((domains) => domains.every((d) => ALLOWED_DOMAINS.includes(d)), {
      message: `Every domain must be in the approved allowlist: ${ALLOWED_DOMAINS.join(", ")}`,
    }),
  allowedActions: z
    .array(z.enum(BROWSER_ACTION_KINDS))
    .min(1)
    .refine((actions) => actions.every((a) => (BROWSER_ACTION_KINDS as readonly string[]).includes(a)), {
      message: "Every action must be in the code-owned allowlist.",
    }),
  maxPages: z.number().int().min(1).max(20),
  maxSteps: z.number().int().min(1).max(100),
  maxDurationSeconds: z.number().int().min(10).max(600),
});

export type DiscoveryFlowCandidate = z.infer<typeof discoveryFlowCandidateSchema>;

export const planRequestSchema = z.object({
  goal: z.string().min(10).max(2000),
  requestedFlowCount: z.number().int().min(1).max(10),
});
