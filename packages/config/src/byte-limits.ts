/**
 * Byte-size limit helpers.
 *
 * Centralizes parsing of configurable size caps (upload size, message size,
 * IPC frame size) so a malformed override can never silently disable a guard.
 */
import { getEnv } from "./environment.js";

/**
 * Resolve a byte-size limit from an environment variable.
 *
 * Returns `fallback` when the variable is unset, blank, non-numeric, or not a
 * positive finite number. This is deliberately strict: a bad value (e.g.
 * `"unlimited"`, `"-1"`, `"0"`) falls back to the safe default rather than
 * resolving to `NaN`/`0` and turning the cap off.
 *
 * @param key      Environment variable name (e.g. `NODETOOL_MAX_UPLOAD_BYTES`).
 * @param fallback Default limit in bytes, used when the env var is invalid.
 */
export function getByteLimitEnv(key: string, fallback: number): number {
  const raw = getEnv(key);
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}
