import { z } from "zod";

export const PROFILE_DATA_TYPES = ["STRING", "NUMBER", "BOOLEAN", "LIST", "DATE"] as const;
export type ProfileDataType = (typeof PROFILE_DATA_TYPES)[number];

export const profileSchemaFieldSchema = z.object({
  column_name: z.string().min(1, "column_name is required"),
  data_type: z.enum(PROFILE_DATA_TYPES),
  required: z.enum(["TRUE", "FALSE"]).default("FALSE"),
  description: z.string().default(""),
});

export type ProfileSchemaFieldRow = z.infer<typeof profileSchemaFieldSchema>;

export const PROFILE_RECORD_KINDS = [
  "PROJECT",
  "SKILL",
  "EXPERIENCE",
  "EDUCATION",
  "FACT",
  "CONSTRAINT",
  "GENERIC",
] as const;
export type ProfileRecordKind = (typeof PROFILE_RECORD_KINDS)[number];

/**
 * Reserved column names in candidate-profile.csv. None are mandatory — the
 * importer degrades gracefully when they are absent — but when present they
 * drive evidence matching and the Daily Desk explanation UI.
 */
export const RESERVED_PROFILE_COLUMNS = {
  evidenceId: "evidence_id",
  kind: "kind",
  title: "title",
} as const;

export type ImportIssue = {
  rowIndex: number;
  message: string;
};
