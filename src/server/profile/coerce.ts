import { splitListCell } from "../csv/parseCsv";
import type { ProfileDataType } from "./types";

export type CoerceResult =
  | { ok: true; value: string | number | boolean | string[] }
  | { ok: false; message: string };

export function coerceProfileValue(dataType: ProfileDataType, raw: string): CoerceResult {
  const trimmed = raw.trim();

  switch (dataType) {
    case "STRING":
      return { ok: true, value: trimmed };
    case "NUMBER": {
      const num = Number(trimmed);
      if (Number.isNaN(num)) return { ok: false, message: `"${raw}" is not a number` };
      return { ok: true, value: num };
    }
    case "BOOLEAN": {
      const lower = trimmed.toLowerCase();
      if (["true", "1", "yes"].includes(lower)) return { ok: true, value: true };
      if (["false", "0", "no", ""].includes(lower)) return { ok: true, value: false };
      return { ok: false, message: `"${raw}" is not a boolean` };
    }
    case "LIST":
      return { ok: true, value: splitListCell(trimmed) };
    case "DATE": {
      if (!trimmed) return { ok: true, value: "" };
      const date = new Date(trimmed);
      if (Number.isNaN(date.getTime())) return { ok: false, message: `"${raw}" is not a date` };
      return { ok: true, value: date.toISOString() };
    }
    default:
      return { ok: true, value: trimmed };
  }
}
