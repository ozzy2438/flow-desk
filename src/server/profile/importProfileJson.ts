import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { createHash } from "node:crypto";
import { db } from "../db";
import type { ImportIssue } from "./types";

export type ImportProfileJsonInput = {
  userId: string;
  profileJsonText: string;
  schemaJsonText: string;
};

export type ImportProfileJsonResult = {
  importId: string;
  version: number;
  status: "VALID" | "INVALID";
  rowCount: number;
  errorCount: number;
  errors: ImportIssue[];
};

type RawRecord = Record<string, unknown>;

function uniqueStrings(values: unknown[]): string[] {
  const out = new Set<string>();
  for (const v of values) {
    if (typeof v === "string" && v.trim()) out.add(v.trim());
  }
  return [...out];
}

function monthsBetween(start: string | null, end: string | null): number | null {
  if (!start) return null;
  const startDate = new Date(start.length === 4 ? `${start}-01` : `${start}-01`);
  const endDate = end && end !== "present" ? new Date(end.length === 4 ? `${end}-01` : `${end}-01`) : new Date();
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
  const months = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
  return months >= 0 ? Math.round((months / 12) * 10) / 10 : null;
}

/**
 * Native import for the richer "Apply OS" candidate-profile.json schema -
 * the operator's real evidence library (projects/skills/experience/
 * education/certifications/evidence/claim_policy), not the flat CSV MVP
 * format. Validated against the operator's own JSON Schema file with ajv
 * (the authoritative contract, not a hand-transcribed Zod approximation),
 * then mapped into the same ProfileRecord rows the CSV importer produces -
 * no Prisma migration needed, since ProfileRecord.data is already JSON.
 *
 * `data.skills` / `data.tools` aliases are added to every mapped record so
 * the existing evidence-matching and demo-decision-provider code (which
 * reads those two fields) works unchanged; the full original fields
 * (technologies, methods, outcomes, cv_bullets, allowed_claims,
 * claim_boundaries, cv_usage, resolvedEvidence, ...) are preserved
 * alongside them for the richer claim-safety and evidence-quality logic
 * that reads them directly.
 */
export async function importCandidateProfileJson({
  userId,
  profileJsonText,
  schemaJsonText,
}: ImportProfileJsonInput): Promise<ImportProfileJsonResult> {
  const errors: ImportIssue[] = [];

  let profile: RawRecord;
  let schema: RawRecord;
  try {
    profile = JSON.parse(profileJsonText);
  } catch (err) {
    return {
      importId: "",
      version: 0,
      status: "INVALID",
      rowCount: 0,
      errorCount: 1,
      errors: [{ rowIndex: -1, message: `candidate-profile.json is not valid JSON: ${(err as Error).message}` }],
    };
  }
  try {
    schema = JSON.parse(schemaJsonText);
  } catch (err) {
    return {
      importId: "",
      version: 0,
      status: "INVALID",
      rowCount: 0,
      errorCount: 1,
      errors: [{ rowIndex: -1, message: `candidate-profile.schema.json is not valid JSON: ${(err as Error).message}` }],
    };
  }

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const schemaValid = validate(profile);
  if (!schemaValid) {
    for (const issue of validate.errors ?? []) {
      errors.push({ rowIndex: -1, message: `${issue.instancePath || "(root)"}: ${issue.message}` });
    }
  }

  const status: "VALID" | "INVALID" = errors.length > 0 ? "INVALID" : "VALID";
  const profileHash = createHash("sha256").update(profileJsonText).digest("hex");
  const schemaHash = createHash("sha256").update(schemaJsonText).digest("hex");

  const lastImport = await db.candidateProfileImport.findFirst({
    where: { userId },
    orderBy: { version: "desc" },
  });
  const nextVersion = (lastImport?.version ?? 0) + 1;

  let recordsToCreate: Array<{
    evidenceId: string | null;
    kind: string;
    title: string | null;
    data: RawRecord;
    rawRow: RawRecord;
  }> = [];
  let fieldsToCreate: Array<{ order: number; columnName: string; dataType: string; required: boolean; description: string }> = [];

  if (status === "VALID") {
    const evidenceRegistry = (profile.evidence as RawRecord[]) ?? [];
    const evidenceBySubject = new Map<string, RawRecord[]>();
    for (const ev of evidenceRegistry) {
      const subject = ev.subject as RawRecord | undefined;
      if (!subject) continue;
      const key = `${subject.type}:${subject.id}`;
      const list = evidenceBySubject.get(key) ?? [];
      list.push(ev);
      evidenceBySubject.set(key, list);
    }
    function resolveEvidence(type: string, id: string) {
      return evidenceBySubject.get(`${type}:${id}`) ?? [];
    }

    // --- Projects (the core evidence library) ---
    for (const project of (profile.projects as RawRecord[]) ?? []) {
      const projectId = project.project_id as string;
      const resolved = resolveEvidence("project", projectId);
      const technologies = (project.technologies as string[]) ?? [];
      const methods = (project.methods as string[]) ?? [];
      const keywords = (project.keywords as string[]) ?? [];
      const dataPlatforms = (project.data_platforms as string[]) ?? [];
      const cloudPlatforms = (project.cloud_platforms as string[]) ?? [];
      recordsToCreate.push({
        evidenceId: projectId,
        kind: "PROJECT",
        title: (project.name as string) ?? projectId,
        data: {
          ...project,
          skills: uniqueStrings([...technologies, ...methods, ...keywords]),
          tools: uniqueStrings([...technologies, ...dataPlatforms, ...cloudPlatforms]),
          outcome: ((project.outcomes as RawRecord[]) ?? [])[0]?.statement ?? ((project.cv_bullets as string[]) ?? [])[0] ?? "",
          years_experience: null,
          resolvedEvidence: resolved,
        },
        rawRow: project,
      });
    }

    // --- Skills (evidence is referenced directly by evidence_ids, not a subject link) ---
    for (const skill of (profile.skills as RawRecord[]) ?? []) {
      const skillId = skill.skill_id as string;
      const evidenceIds = (skill.evidence_ids as string[]) ?? [];
      const resolvedByIds = evidenceRegistry.filter((ev) => evidenceIds.includes(ev.evidence_id as string));
      recordsToCreate.push({
        evidenceId: skillId,
        kind: "SKILL",
        title: (skill.name as string) ?? skillId,
        data: {
          ...skill,
          skills: uniqueStrings([skill.name as string, ...((skill.aliases as string[]) ?? [])]),
          tools: [],
          years_experience: null,
          resolvedEvidence: resolvedByIds,
        },
        rawRow: skill,
      });
    }

    // --- Experience ---
    for (const exp of (profile.experience as RawRecord[]) ?? []) {
      const expId = exp.experience_id as string;
      const resolved = resolveEvidence("experience", expId);
      recordsToCreate.push({
        evidenceId: expId,
        kind: "EXPERIENCE",
        title: (exp.role_title as string) ?? expId,
        data: {
          ...exp,
          skills: [],
          tools: [],
          years_experience: monthsBetween((exp.start_date as string) ?? null, (exp.end_date as string) ?? null),
          resolvedEvidence: resolved,
        },
        rawRow: exp,
      });
    }

    // --- Education ---
    (profile.education as RawRecord[] | undefined)?.forEach((edu, i) => {
      const eduId = `EDU-${String(i + 1).padStart(2, "0")}`;
      recordsToCreate.push({
        evidenceId: eduId,
        kind: "EDUCATION",
        title: (edu.qualification as string) ?? eduId,
        data: { ...edu, skills: [], tools: [] },
        rawRow: edu,
      });
    });

    // --- Certifications ---
    (profile.certifications as RawRecord[] | undefined)?.forEach((cert, i) => {
      const certId = `CERT-${String(i + 1).padStart(2, "0")}`;
      recordsToCreate.push({
        evidenceId: certId,
        kind: "GENERIC",
        title: (cert.name as string) ?? certId,
        data: { ...cert, recordType: "CERTIFICATION", skills: [], tools: [] },
        rawRow: cert,
      });
    });

    // --- Capability patterns and role families (used by policy ranking-boost import) ---
    (profile.capability_patterns as RawRecord[] | undefined)?.forEach((pattern) => {
      recordsToCreate.push({
        evidenceId: pattern.pattern_id as string,
        kind: "FACT",
        title: `Capability pattern ${pattern.pattern_id}`,
        data: { ...pattern, recordType: "CAPABILITY_PATTERN" },
        rawRow: pattern,
      });
    });
    (profile.capability_role_families as RawRecord[] | undefined)?.forEach((family, i) => {
      recordsToCreate.push({
        evidenceId: `ROLE-FAMILY-${i + 1}`,
        kind: "FACT",
        title: family.role_family as string,
        data: { ...family, recordType: "ROLE_FAMILY" },
        rawRow: family,
      });
    });

    // --- Candidate-level facts and constraints ---
    const candidate = (profile.candidate as RawRecord) ?? {};
    recordsToCreate.push({
      evidenceId: null,
      kind: "CONSTRAINT",
      title: "Location and work rights",
      data: {
        recordType: "CANDIDATE_FACTS",
        location: candidate.location,
        work_rights: candidate.work_rights,
        years_experience: candidate.years_experience,
        summary: (candidate.professional_summary as string) ?? "",
      },
      rawRow: candidate,
    });

    const constraints = (profile.constraints as RawRecord) ?? {};
    recordsToCreate.push({
      evidenceId: null,
      kind: "CONSTRAINT",
      title: "Constraints",
      data: { ...constraints, recordType: "CONSTRAINTS" },
      rawRow: constraints,
    });

    // --- Claim policy (read by the cover-letter claim verifier) ---
    const claimPolicy = (profile.claim_policy as RawRecord) ?? {};
    recordsToCreate.push({
      evidenceId: null,
      kind: "FACT",
      title: "Claim policy",
      data: { ...claimPolicy, recordType: "CLAIM_POLICY" },
      rawRow: claimPolicy,
    });

    fieldsToCreate = [
      { order: 0, columnName: "(json import)", dataType: "STRING", required: false, description: "Imported from candidate-profile.json, validated against candidate-profile.schema.json with ajv." },
    ];
  }

  const created = await db.$transaction(async (tx) => {
    if (status === "VALID") {
      await tx.candidateProfileImport.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false },
      });
    }

    return tx.candidateProfileImport.create({
      data: {
        userId,
        version: nextVersion,
        sourceFileHash: profileHash,
        schemaHash,
        status,
        rowCount: recordsToCreate.length,
        errorCount: errors.length,
        errors: errors as unknown as object[],
        isActive: status === "VALID",
        fields: { create: fieldsToCreate },
        records:
          status === "VALID"
            ? {
                create: recordsToCreate.map((record, rowIndex) => ({
                  rowIndex,
                  evidenceId: record.evidenceId,
                  kind: record.kind as never,
                  title: record.title,
                  data: record.data as object,
                  rawRow: record.rawRow as object,
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
    rowCount: recordsToCreate.length,
    errorCount: errors.length,
    errors,
  };
}
