import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { importCandidateProfile, getActiveProfileImport } from "@/server/profile/importProfile";
import { importDecisionPolicy, getActivePolicyImport } from "@/server/policy/importPolicy";

const TEST_EMAIL = "vitest-csv-import@flow-desk.local";

const SCHEMA_CSV = `column_name,data_type,required,description
kind,STRING,TRUE,kind
evidence_id,STRING,FALSE,id
title,STRING,TRUE,title
skills,LIST,FALSE,skills
`;

const VALID_PROFILE_CSV = `kind,evidence_id,title,skills
PROJECT,proj-1,Test project,python|sql
`;

const INVALID_PROFILE_CSV = `kind,evidence_id,title,skills
PROJECT,proj-1,,python|sql
`;

const VALID_POLICY_CSV = `rule_code,category,field,operator,value,action,reason,active
ROLE_EXCL,ROLE_EXCLUSION,title,CONTAINS,Recruiter,HARD_BLOCK,"Not a target role",TRUE
`;

const INVALID_POLICY_CSV = `rule_code,category,field,operator,value,action,reason,active
BAD_ACTION,ROLE_EXCLUSION,title,CONTAINS,Recruiter,DESTROY,"invalid action",TRUE
`;

let userId: string;

beforeAll(async () => {
  const user = await db.user.upsert({
    where: { email: TEST_EMAIL },
    update: {},
    create: { email: TEST_EMAIL },
  });
  userId = user.id;
});

afterAll(async () => {
  await db.candidateProfileImport.deleteMany({ where: { userId } });
  await db.decisionPolicyImport.deleteMany({ where: { userId } });
  await db.user.delete({ where: { id: userId } }).catch(() => {});
});

describe("importCandidateProfile", () => {
  it("activates a valid import and makes it the active profile", async () => {
    const result = await importCandidateProfile({
      userId,
      profileCsvText: VALID_PROFILE_CSV,
      schemaCsvText: SCHEMA_CSV,
    });
    expect(result.status).toBe("VALID");
    expect(result.errorCount).toBe(0);

    const active = await getActiveProfileImport(userId);
    expect(active?.id).toBe(result.importId);
    expect(active?.records).toHaveLength(1);
    expect(active?.records[0]?.evidenceId).toBe("proj-1");
  });

  it("stores an invalid import for its error report but never activates it (Phase 1 requirement)", async () => {
    const before = await getActiveProfileImport(userId);

    const result = await importCandidateProfile({
      userId,
      profileCsvText: INVALID_PROFILE_CSV,
      schemaCsvText: SCHEMA_CSV,
    });
    expect(result.status).toBe("INVALID");
    expect(result.errorCount).toBeGreaterThan(0);

    const after = await getActiveProfileImport(userId);
    expect(after?.id).toBe(before?.id); // unchanged - still the last valid version
  });

  it("rejects a column not declared in the schema file", async () => {
    const result = await importCandidateProfile({
      userId,
      profileCsvText: "kind,evidence_id,title,undeclared_column\nPROJECT,p2,Title,value\n",
      schemaCsvText: SCHEMA_CSV,
    });
    expect(result.status).toBe("INVALID");
  });
});

describe("importDecisionPolicy", () => {
  it("activates a valid policy import", async () => {
    const result = await importDecisionPolicy({ userId, policyCsvText: VALID_POLICY_CSV });
    expect(result.status).toBe("VALID");

    const active = await getActivePolicyImport(userId);
    expect(active?.id).toBe(result.importId);
    expect(active?.rules).toHaveLength(1);
  });

  it("rejects an unknown policy action and never activates it", async () => {
    const before = await getActivePolicyImport(userId);
    const result = await importDecisionPolicy({ userId, policyCsvText: INVALID_POLICY_CSV });
    expect(result.status).toBe("INVALID");

    const after = await getActivePolicyImport(userId);
    expect(after?.id).toBe(before?.id);
  });
});
