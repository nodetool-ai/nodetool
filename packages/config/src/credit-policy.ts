/**
 * Which managed models credits may be spent on, and what a new user starts
 * with — the two knobs a production operator turns.
 *
 * NodeTool's `nodetool` provider runs curated delegates on platform-owned
 * keys, so every call through it spends the operator's money. The operator
 * therefore decides which of the catalog's entries are open for business:
 * `NODETOOL_CREDIT_MODELS` names them, and anything else is refused before a
 * key is used. Unset means the whole catalog — the right default for a
 * staging or dev server that holds platform keys.
 *
 * None of this reaches a local install: `nodetool` is a cloud-only provider
 * (`CLOUD_ONLY_PROVIDER_IDS`), unregistered off the cloud profile, so a
 * desktop or self-hosted server has no managed provider to whitelist.
 *
 * Parsing lives here rather than next to the catalog because the catalog
 * (`@nodetool-ai/protocol`) is browser-safe pure data with no environment to
 * read. Callers resolve names against the catalog themselves.
 */
import { safeProcessEnv } from "./node-import.js";

/** Names the managed models credits may be spent on. */
export const CREDIT_MODELS_ENV = "NODETOOL_CREDIT_MODELS";
/** One-time welcome grant, in credits, for a user seen for the first time. */
export const SIGNUP_CREDITS_ENV = "NODETOOL_SIGNUP_CREDITS";

/** Credits a new user is granted when no override is configured. */
export const DEFAULT_SIGNUP_CREDITS = 500;

type Env = Record<string, string | undefined>;

/**
 * The configured allowlist of managed model ids, or `null` when the operator
 * set none — `null` is "the whole catalog", not "nothing".
 *
 * Entries are separated by commas, whitespace, or newlines, so the variable
 * reads the same in a `.env` file, a `fly secrets` line, and a Compose file.
 */
export function creditModelAllowlist(
  env: Env = safeProcessEnv()
): ReadonlySet<string> | null {
  const raw = env[CREDIT_MODELS_ENV]?.trim();
  if (!raw) return null;
  const ids = raw
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  return ids.length > 0 ? new Set(ids) : null;
}

/** Whether `modelId` may be served by the managed provider on this server. */
export function isCreditModelAllowed(
  modelId: string,
  env: Env = safeProcessEnv()
): boolean {
  const allowed = creditModelAllowlist(env);
  return allowed === null || allowed.has(modelId);
}

/**
 * Credits granted once, the first time a user is seen. `0` (or any negative
 * or unparseable value) means no welcome grant — the monthly plan grant is
 * then all a new user gets.
 */
export function signupGrantCredits(env: Env = safeProcessEnv()): number {
  const raw = env[SIGNUP_CREDITS_ENV]?.trim();
  if (raw === undefined || raw === "") return DEFAULT_SIGNUP_CREDITS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}
