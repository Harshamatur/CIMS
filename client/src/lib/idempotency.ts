import type { IssueBody } from "@/types/api";
import { newId } from "./utils";

/** Canonical form of an issue payload; lines are sorted so ordering never changes the signature. */
export function issueSignature(body: IssueBody): string {
  const lines = [...body.lines].sort((a, b) => a.requestItemId.localeCompare(b.requestItemId));
  return JSON.stringify({ lines, note: body.note ?? "" });
}

/**
 * Keeps ONE Idempotency-Key per distinct payload. A retry of the same payload (e.g. after a network drop where the
 * first attempt may have reached the server) re-uses the key, so the backend can never deduct twice. Changing the
 * quantities creates a new key. Call reset() after a confirmed success.
 */
export class IssueKeyStore {
  private signature: string | null = null;
  private key: string | null = null;

  keyFor(body: IssueBody): string {
    const sig = issueSignature(body);
    if (this.key === null || this.signature !== sig) {
      this.signature = sig;
      this.key = newId();
    }
    return this.key;
  }

  reset(): void {
    this.signature = null;
    this.key = null;
  }
}
