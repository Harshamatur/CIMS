import { describe, expect, it } from "vitest";
import { EnvError, loadEnv } from "../../src/config/env.js";

const valid = {
  APP_ORIGIN: "http://localhost:5173",
  DATABASE_URL: "postgresql://user:SUPERSECRETPW@host/db",
  SESSION_SECRET: "x".repeat(40),
};

describe("environment validation", () => {
  it("applies safe defaults", () => {
    const env = loadEnv(valid);
    expect(env.PORT).toBe(3000);
    expect(env.ALLOW_ADMIN_ISSUE).toBe(false);
    expect(env.swaggerEnabled).toBe(true);
  });
  it("fails with variable names, never values", () => {
    try {
      loadEnv({ DATABASE_URL: "mysql://user:SUPERSECRETPW@host/db", SESSION_SECRET: "short" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(EnvError);
      const msg = (e as Error).message;
      expect(msg).toContain("DATABASE_URL");
      expect(msg).toContain("SESSION_SECRET");
      expect(msg).toContain("APP_ORIGIN");
      expect(msg).not.toContain("SUPERSECRETPW");
      expect(msg).not.toContain("short");
    }
  });
  it("is stricter in production", () => {
    expect(() => loadEnv({ ...valid, NODE_ENV: "production" })).toThrow(/https/);
    const prod = loadEnv({ ...valid, NODE_ENV: "production", APP_ORIGIN: "https://cims.example.org" });
    expect(prod.swaggerEnabled).toBe(false);
  });
});
