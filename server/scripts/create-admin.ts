/**
 * One-time, controlled bootstrap of the FIRST administrator.
 *   ADMIN_EMPLOYEE_CODE=ADM-001 ADMIN_FULL_NAME="Jane Doe" ADMIN_EMAIL=jane@example.org npm run admin:create
 * The password comes from ADMIN_BOOTSTRAP_PASSWORD or, if unset, a hidden interactive prompt.
 * Refuses to run if any ADMIN already exists. The password is never printed or logged.
 */
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { hashPassword, passwordPolicy } from "../src/common/password.js";
import { createScriptPrisma } from "../src/db/script-client.js";

function promptHidden(question: string): Promise<string> {
  let muted = false;
  const out = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output: out, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

async function main(): Promise<void> {
  const employeeCode = process.env.ADMIN_EMPLOYEE_CODE?.trim();
  const fullName = process.env.ADMIN_FULL_NAME?.trim();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase() || null;
  if (!employeeCode || !fullName) {
    throw new Error("ADMIN_EMPLOYEE_CODE and ADMIN_FULL_NAME are required (ADMIN_EMAIL optional).");
  }
  const password =
    process.env.ADMIN_BOOTSTRAP_PASSWORD ?? (await promptHidden("Initial admin password (min 12 chars): "));
  const parsed = passwordPolicy.safeParse(password);
  if (!parsed.success)
    throw new Error(`Password rejected: ${parsed.error.issues.map((i) => i.message).join(", ")}`);

  const db = createScriptPrisma();
  try {
    if ((await db.user.count({ where: { role: "ADMIN" } })) > 0) {
      throw new Error("An ADMIN already exists. Create further users through the API (POST /users).");
    }
    const passwordHash = await hashPassword(password);
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { employeeCode, fullName, email, role: "ADMIN", passwordHash },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: null,
          action: "ADMIN_BOOTSTRAPPED",
          entityType: "user",
          entityId: created.id,
          afterData: { employeeCode, role: "ADMIN" },
        },
      });
      return created;
    });
    console.log(`Administrator ${user.employeeCode} created.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : "Failed");
  process.exit(1);
});
