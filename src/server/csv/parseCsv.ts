import Papa from "papaparse";
import { createHash } from "node:crypto";

export type CsvRow = Record<string, string>;

export type CsvParseResult = {
  rows: CsvRow[];
  errors: Array<{ rowIndex: number; message: string }>;
  hash: string;
};

/**
 * Parses CSV text with header row into plain string-valued records. Values
 * are intentionally left as strings here — type coercion happens later,
 * against a declared schema, so a bad cell produces a reportable validation
 * error instead of a silently wrong number.
 */
export function parseCsv(csvText: string): CsvParseResult {
  const result = Papa.parse<CsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  const errors = result.errors.map((err) => ({
    rowIndex: err.row ?? -1,
    message: err.message,
  }));

  const hash = createHash("sha256").update(csvText).digest("hex");

  return { rows: result.data, errors, hash };
}

export function splitListCell(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[|;]/)
    .map((part) => part.trim())
    .filter(Boolean);
}
