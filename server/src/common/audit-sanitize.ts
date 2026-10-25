const SENSITIVE_KEY = /pass(word)?|hash|secret|token|session|cookie|authorization|connection|database_?url/i;
const MAX_DEPTH = 6;

function isDecimalLike(value: object): boolean {
  return "toFixed" in value && "toString" in value && Object.keys(value).length === 0;
}

/** Deep-clone a value into audit-safe JSON: sensitive keys removed, Dates/BigInts/Decimals stringified, depth-limited. */
export function sanitizeForAudit(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (depth > MAX_DEPTH) return "[truncated]";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((v) => sanitizeForAudit(v, depth + 1));
  if (typeof value === "object") {
    if (isDecimalLike(value)) return String(value);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(k)) continue;
      out[k] = sanitizeForAudit(v, depth + 1);
    }
    return out;
  }
  return value;
}
