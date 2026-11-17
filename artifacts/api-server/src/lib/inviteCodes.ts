import { createHash, randomInt } from "node:crypto";

/**
 * Invite codes a couple reads to each other or pastes into a message:
 * 8 characters from an alphabet without look-alikes (no 0/O or 1/I),
 * shown as ABCD-EFGH. 32^8 is about 1.1 trillion codes, each single use
 * and valid for a week.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_LENGTH = 8;
export const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

/** "abcd efgh" and "ABCD-EFGH" are the same code; anything else is not a code. */
export function normalizeInviteCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== INVITE_CODE_LENGTH) return null;
  for (const char of code) {
    if (!ALPHABET.includes(char)) return null;
  }
  return code;
}

export function formatInviteCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Only the hash is stored, so reading the database never reveals a live code. */
export function hashInviteCode(code: string): string {
  return createHash("sha256").update(`wedding-invite:${code}`).digest("hex");
}

/**
 * Counts wrong codes per user so nobody can guess their way in. In-memory and
 * per server instance: a backstop to the code's size, not the main defence.
 */
export class AttemptLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly maxFailures: number,
    private readonly windowMs: number,
  ) {}

  private recent(key: string, now: number): number[] {
    const kept = (this.failures.get(key) ?? []).filter(
      (at) => now - at < this.windowMs,
    );
    if (kept.length === 0) this.failures.delete(key);
    else this.failures.set(key, kept);
    return kept;
  }

  isBlocked(key: string, now = Date.now()): boolean {
    return this.recent(key, now).length >= this.maxFailures;
  }

  recordFailure(key: string, now = Date.now()): void {
    this.failures.set(key, [...this.recent(key, now), now]);
  }

  clear(key: string): void {
    this.failures.delete(key);
  }
}
