import { db } from "../db";

export async function findDuplicateJob(dedupeKey: string) {
  return db.jobPosting.findFirst({ where: { dedupeKey }, include: { evaluation: true } });
}
