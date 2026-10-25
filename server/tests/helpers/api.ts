import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Express } from "express";
import type pg from "pg";
import request from "supertest";
import { insertUser } from "./pg.js";

/** The Prisma Client is generated at install time (`npx prisma generate`); without it these suites cannot run. */
export const HAS_PRISMA_CLIENT = existsSync(
  fileURLToPath(new URL("../../src/generated/prisma/client.ts", import.meta.url)),
);
export const PASSWORD = "correct-horse-battery-staple";

export async function buildTestApp(): Promise<Express> {
  const { createApp } = await import("../../src/app.js");
  return createApp();
}

export interface Session {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
  userId: string;
}

export async function loginAs(
  app: Express,
  identifier: string,
  password = PASSWORD,
): Promise<Session & { status: number; body: unknown }> {
  const agent = request.agent(app);
  const tokenRes = await agent.get("/api/v1/auth/csrf");
  const res = await agent
    .post("/api/v1/auth/login")
    .set("X-CSRF-Token", tokenRes.body.data.csrfToken)
    .send({ identifier, password });
  return {
    agent,
    csrf: res.body?.data?.csrfToken ?? tokenRes.body.data.csrfToken,
    userId: res.body?.data?.user?.id,
    status: res.status,
    body: res.body,
  };
}

export const post = (s: Session, path: string, body: object = {}, headers: Record<string, string> = {}) =>
  s.agent.post(`/api/v1${path}`).set("X-CSRF-Token", s.csrf).set(headers).send(body);
export const patch = (s: Session, path: string, body: object) =>
  s.agent.patch(`/api/v1${path}`).set("X-CSRF-Token", s.csrf).send(body);
export const get = (s: Session, path: string) => s.agent.get(`/api/v1${path}`);

/** Creates a user directly in the test database with a real Argon2id hash. */
export async function createUserRow(pool: pg.Pool, role: string, status = "ACTIVE") {
  const { hashPassword } = await import("../../src/common/password.js");
  const id = await insertUser(pool, role);
  const hash = await hashPassword(PASSWORD);
  const { rows } = await pool.query(
    "UPDATE users SET password_hash = $2, status = $3::user_status, email = lower(employee_code) || '@test.invalid' WHERE id = $1::uuid RETURNING employee_code",
    [id, hash, status],
  );
  return { id, employeeCode: rows[0].employee_code as string };
}
