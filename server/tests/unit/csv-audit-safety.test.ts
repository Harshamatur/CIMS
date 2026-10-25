import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "../../src/common/csv.js";
import { sanitizeForAudit } from "../../src/common/audit-sanitize.js";
import { assertSafeTestDatabase } from "../../src/common/db-safety.js";

describe("CSV export safety", () => {
  it("neutralises spreadsheet formula injection", () => {
    for (const evil of ["=1+1", "+SUM(A1)", "-2+3", "@cmd", "\t=x", "\r=x"]) {
      expect(csvCell(evil).startsWith(`"'`)).toBe(true);
    }
  });
  it("escapes quotes and keeps numbers numeric", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(-5)).toBe('"-5"');
    expect(csvCell(null)).toBe('""');
  });
  it("emits CRLF-separated rows", () => {
    expect(toCsv(["a", "b"], [[1, "=x"]])).toBe('"a","b"\r\n"1","\'=x"\r\n');
  });
});

describe("audit sanitisation", () => {
  it("drops password/hash/token/session/secret keys at any depth", () => {
    const out = sanitizeForAudit({
      fullName: "A",
      passwordHash: "x",
      nested: { sessionId: "s", token: "t", ok: 1, list: [{ secret: "z", keep: true }] },
    });
    expect(out).toEqual({ fullName: "A", nested: { ok: 1, list: [{ keep: true }] } });
  });
  it("stringifies dates and bigints", () => {
    expect(sanitizeForAudit({ d: new Date("2026-01-02T03:04:05Z"), n: 5n })).toEqual({
      d: "2026-01-02T03:04:05.000Z",
      n: "5",
    });
  });
});

describe("test-database safety guard", () => {
  it("requires a _test database name", () => {
    expect(() => assertSafeTestDatabase("postgresql://u:p@127.0.0.1:5432/cims", {})).toThrow(/_test/);
  });
  it("refuses remote hosts unless explicitly allowed", () => {
    const url = "postgresql://u:p@ep-x.neon.tech/cims_test";
    expect(() => assertSafeTestDatabase(url, {})).toThrow(/remote/);
    expect(() => assertSafeTestDatabase(url, { ALLOW_REMOTE_TEST_DB: "true" })).not.toThrow();
  });
  it("refuses a URL equal to DATABASE_URL / DIRECT_URL", () => {
    const url = "postgresql://u:p@127.0.0.1:5432/cims_test";
    expect(() => assertSafeTestDatabase(url, { DATABASE_URL: url })).toThrow(/equals DATABASE_URL/);
  });
  it("accepts a local _test database", () => {
    expect(() => assertSafeTestDatabase("postgresql://u:p@localhost:5432/cims_test", {})).not.toThrow();
  });
});
