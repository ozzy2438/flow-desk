import { db } from "./db";

/**
 * Milestone 1 ships single-user development auth, per SETUP.md: "authentication
 * placeholder or single-user development mode." There is exactly one operator
 * account; swap this module for real session-based auth (NextAuth or similar)
 * without touching callers, since every caller only depends on `getCurrentUser`.
 */
const DEV_USER_EMAIL = process.env.DEV_USER_EMAIL ?? "operator@flow-desk.local";

export async function getCurrentUser() {
  const existing = await db.user.findUnique({ where: { email: DEV_USER_EMAIL } });
  if (existing) return existing;
  return db.user.create({ data: { email: DEV_USER_EMAIL } });
}
