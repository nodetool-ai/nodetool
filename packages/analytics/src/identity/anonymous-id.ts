/**
 * The anonymous installation ID: a random UUID generated on the client, never
 * derived from an account, a machine identifier, a path or a hostname. It
 * rotates after {@link ANONYMOUS_ID_LIFETIME_MS}, so no installation carries
 * one ID for longer than about a month.
 */
export interface AnonymousIdentity {
  anonymousId: string;
  createdAt: string;
}

export const ANONYMOUS_ID_LIFETIME_MS = 30 * 24 * 3_600_000;

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function randomId(): string {
  return globalThis.crypto.randomUUID();
}

export function createAnonymousIdentity(now: Date): AnonymousIdentity {
  return { anonymousId: randomId(), createdAt: now.toISOString() };
}

/** Parse a stored identity, or null when it is missing or malformed. */
export function parseAnonymousIdentity(value: unknown): AnonymousIdentity | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const anonymousId = record["anonymousId"];
  const createdAt = record["createdAt"];
  if (typeof anonymousId !== "string" || !UUID_V4.test(anonymousId)) return null;
  if (typeof createdAt !== "string" || Number.isNaN(Date.parse(createdAt))) {
    return null;
  }
  return { anonymousId, createdAt };
}

/** The stored identity while it is young enough, otherwise a fresh one. */
export function currentAnonymousIdentity(
  stored: AnonymousIdentity | null,
  now: Date
): { identity: AnonymousIdentity; rotated: boolean } {
  if (stored) {
    const age = now.getTime() - Date.parse(stored.createdAt);
    if (age >= 0 && age < ANONYMOUS_ID_LIFETIME_MS) {
      return { identity: stored, rotated: false };
    }
  }
  return { identity: createAnonymousIdentity(now), rotated: true };
}
