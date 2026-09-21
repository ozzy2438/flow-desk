import { db } from "../db";
import { parseCsv } from "../csv/parseCsv";
import { coerceProfileValue } from "./coerce";
import {
  profileSchemaFieldSchema,
  RESERVED_PROFILE_COLUMNS,
  PROFILE_RECORD_KINDS,
  type ImportIssue,
  type ProfileRecordKind,
} from "./types";

export type ImportProfileInput = {
  userId: string;
  profileCsvText: string;
  schemaCsvText: string;
};

export type ImportProfileResult = {
  importId: string;
  version: number;
  status: "VALID" | "INVALID";
  rowCount: number;
  errorCount: number;
  errors: ImportIssue[];
};

function isRecordKind(value: string | undefined): value is ProfileRecordKind {
  return !!value && (PROFILE_RECORD_KINDS as readonly string[]).includes(value.toUpperCase());
}

/**
 * Imports candidate-profile.schema.csv + candidate-profile.csv into a
 * versioned, validated store. An import that fails validation is still
 * persisted (for the policy-inspector-style error report) but is never
 * activated, so production evaluation keeps running against the last good
 * version — Phase 1's "block production evaluation if invalid" requirement,
 * applied at the activation boundary rather than at write time.
 */
export async function importCandidateProfile({
  userId,
  profileCsvText,
  schemaCsvText,
}: ImportProfileInput): Promise<ImportProfileResult> {
  const errors: ImportIssue[] = [];

  const schemaParse = parseCsv(schemaCsvText);
  const profileParse = parseCsv(profileCsvText);
  errors.push(...schemaParse.errors, ...profileParse.errors);

  const schemaFields = schemaParse.rows
    .map((row, index) => {
      const parsed = profileSchemaFieldSchema.safeParse(row);
      if (!parsed.success) {
        errors.push({
          rowIndex: index,
          message: `schema row ${index + 1}: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        });
        return null;
      }
      return parsed.data;
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  const columnNames = new Set(schemaFields.map((f) => f.column_name));

  const recordsToCreate: Array<{
    rowIndex: number;
    evidenceId: string | null;
    kind: ProfileRecordKind;
    title: string | null;
    data: Record<string, unknown>;
    rawRow: Record<string, string>;
  }> = [];

  profileParse.rows.forEach((row, rowIndex) => {
    const data: Record<string, unknown> = {};
    let rowHasError = false;

    for (const field of schemaFields) {
      const raw = row[field.column_name];
      const isPresent = raw !== undefined && raw.trim() !== "";

      if (field.required === "TRUE" && !isPresent) {
        errors.push({
          rowIndex,
          message: `row ${rowIndex + 1}: missing required column "${field.column_name}"`,
        });
        rowHasError = true;
        continue;
      }

      if (!isPresent) continue;

      const coerced = coerceProfileValue(field.data_type, raw);
      if (!coerced.ok) {
        errors.push({
          rowIndex,
          message: `row ${rowIndex + 1}, column "${field.column_name}": ${coerced.message}`,
        });
        rowHasError = true;
        continue;
      }
      data[field.column_name] = coerced.value;
    }

    for (const key of Object.keys(row)) {
      if (!columnNames.has(key) && key.trim() !== "") {
        errors.push({
          rowIndex,
          message: `row ${rowIndex + 1}: column "${key}" is not declared in candidate-profile.schema.csv`,
        });
        rowHasError = true;
      }
    }

    if (rowHasError) return;

    const kindRaw = row[RESERVED_PROFILE_COLUMNS.kind];
    const kind: ProfileRecordKind = isRecordKind(kindRaw)
      ? (kindRaw.toUpperCase() as ProfileRecordKind)
      : "GENERIC";
    const evidenceId = row[RESERVED_PROFILE_COLUMNS.evidenceId]?.trim() || null;
    const title =
      row[RESERVED_PROFILE_COLUMNS.title]?.trim() ||
      (typeof data[schemaFields[0]?.column_name ?? ""] === "string"
        ? (data[schemaFields[0]!.column_name] as string)
        : null);

    recordsToCreate.push({ rowIndex, evidenceId, kind, title, data, rawRow: row });
  });

  const status: "VALID" | "INVALID" = errors.length > 0 ? "INVALID" : "VALID";

  const lastImport = await db.candidateProfileImport.findFirst({
    where: { userId },
    orderBy: { version: "desc" },
  });
  const nextVersion = (lastImport?.version ?? 0) + 1;

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
        sourceFileHash: profileParse.hash,
        schemaHash: schemaParse.hash,
        status,
        rowCount: profileParse.rows.length,
        errorCount: errors.length,
        errors: errors as unknown as object[],
        isActive: status === "VALID",
        fields: {
          create: schemaFields.map((field, order) => ({
            order,
            columnName: field.column_name,
            dataType: field.data_type,
            required: field.required === "TRUE",
            description: field.description,
          })),
        },
        records:
          status === "VALID"
            ? {
                create: recordsToCreate.map((record) => ({
                  rowIndex: record.rowIndex,
                  evidenceId: record.evidenceId,
                  kind: record.kind,
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
    rowCount: profileParse.rows.length,
    errorCount: errors.length,
    errors,
  };
}

export async function getActiveProfileImport(userId: string) {
  return db.candidateProfileImport.findFirst({
    where: { userId, isActive: true },
    include: { fields: { orderBy: { order: "asc" } }, records: true },
  });
}
