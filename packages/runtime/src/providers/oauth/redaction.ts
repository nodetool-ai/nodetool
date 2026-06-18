/**
 * Redaction helpers. The single rule of this subsystem: secrets never reach a
 * log sink, an error message, or a thrown payload in cleartext. Anything that
 * might carry token material is funnelled through here first.
 */

const REDACTED = "<redacted>";

/** Keys whose values are always scrubbed, regardless of nesting depth. */
const SENSITIVE_KEYS = new Set([
  "access_token",
  "accesstoken",
  "refresh_token",
  "refreshtoken",
  "code",
  "code_verifier",
  "codeverifier",
  "client_secret",
  "clientsecret",
  "authorization",
  "id_token",
  "idtoken"
]);

/**
 * Redact a single secret string for diagnostics: keep a short, non-reversible
 * prefix so two different tokens are distinguishable in logs, hide the rest.
 * An empty/short value collapses entirely to `<redacted>`.
 */
export function redactToken(value: string | null | undefined): string {
  if (!value) return REDACTED;
  if (value.length <= 8) return REDACTED;
  return `${value.slice(0, 4)}…${REDACTED}`;
}

/**
 * Deep-clone an arbitrary value with all sensitive fields replaced by
 * `<redacted>`. Safe to pass straight into a logger. Cycles are broken with a
 * `[Circular]` marker so logging can never throw.
 */
export function redactObject(input: unknown, seen = new WeakSet<object>()): unknown {
  if (input === null || typeof input !== "object") {
    return input;
  }
  if (seen.has(input as object)) {
    return "[Circular]";
  }
  seen.add(input as object);

  if (Array.isArray(input)) {
    return input.map((item) => redactObject(item, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      out[key] = REDACTED;
    } else {
      out[key] = redactObject(val, seen);
    }
  }
  return out;
}
