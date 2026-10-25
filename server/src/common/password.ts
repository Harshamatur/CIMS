import argon2 from "argon2";
import { z } from "./zod.js";

/** OWASP-recommended Argon2id minimum profile (19 MiB, t=2, p=1). Raise for production hardware. */
const OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (plain: string): Promise<string> => argon2.hash(plain, OPTIONS);

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;
/** Verifies against a throw-away hash so unknown identifiers cost the same time as wrong passwords. */
export async function burnPasswordCheck(plain: string): Promise<void> {
  dummyHash ??= hashPassword("cims-timing-equaliser-not-a-credential");
  await verifyPassword(await dummyHash, plain);
}

export const passwordPolicy = z
  .string()
  .min(12, "must be at least 12 characters")
  .max(128, "must be at most 128 characters");
