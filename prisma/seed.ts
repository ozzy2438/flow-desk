import { readFileSync } from "node:fs";
import path from "node:path";
import { db } from "../src/server/db";
import { getCurrentUser } from "../src/server/auth";
import { importCandidateProfile } from "../src/server/profile/importProfile";
import { importDecisionPolicy } from "../src/server/policy/importPolicy";

const FIXTURES_DIR = path.join(process.cwd(), "fixtures", "demo-data");

function read(file: string) {
  return readFileSync(path.join(FIXTURES_DIR, file), "utf8");
}

/**
 * Loads the synthetic demo candidate profile and decision policy so the app
 * is usable end-to-end with zero setup. Real operator data dropped into
 * `data/` via the profile/policy import UI always takes precedence — this
 * only runs when nothing has been imported yet.
 */
async function main() {
  const user = await getCurrentUser();

  const existingProfile = await db.candidateProfileImport.findFirst({ where: { userId: user.id } });
  if (!existingProfile) {
    const result = await importCandidateProfile({
      userId: user.id,
      profileCsvText: read("candidate-profile.csv"),
      schemaCsvText: read("candidate-profile.schema.csv"),
    });
    console.log(`Seeded demo candidate profile: ${result.status}, ${result.rowCount} rows`);
  } else {
    console.log("Candidate profile already imported, skipping demo seed.");
  }

  const existingPolicy = await db.decisionPolicyImport.findFirst({ where: { userId: user.id } });
  if (!existingPolicy) {
    const result = await importDecisionPolicy({
      userId: user.id,
      policyCsvText: read("decision-policy.csv"),
    });
    console.log(`Seeded demo decision policy: ${result.status}, ${result.rowCount} rows`);
  } else {
    console.log("Decision policy already imported, skipping demo seed.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
