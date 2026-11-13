/**
 * The failure classes a refused provider call falls into, and the one place
 * that reads them out of a status code and the provider's own words.
 *
 * The status alone misleads. OpenAI answers an empty account with 429, the
 * same status as a burst limit. Anthropic answers it with 400. Gemini answers
 * a free-tier key that has no quota for a model with 429 and "limit: 0", and
 * says a model is gone with 404 or with a 400 that names the model. A user
 * fixes each of these in a different place: billing, waiting, the key, or the
 * model picker. The runtime stamps the class on `provider_call_failed`, and the
 * web app reads error text with the same rules when no frame arrived.
 */

/**
 * - `auth`: the key was refused. Fix it in Settings.
 * - `payment`: the account has no credit or billing. Top up with the provider.
 * - `quota`: the key has no quota left for this model, or none at all on a
 *   free tier. Enable billing or switch model.
 * - `rate_limit`: too many requests in a short time. Wait and retry.
 * - `not_found`: the provider does not serve this model to this key.
 * - `timeout`, `server`, `network`, `client`, `unknown`: not about the account.
 */
export type ProviderFailureKind =
  | "auth"
  | "payment"
  | "quota"
  | "rate_limit"
  | "not_found"
  | "timeout"
  | "server"
  | "network"
  | "client"
  | "unknown";

export interface ProviderFailureSignals {
  /** HTTP status, when the failure carried one. */
  status?: number | null;
  /** The error message, as the provider wrote it. */
  message?: string | null;
  /** A provider error code, such as OpenAI's `insufficient_quota`. */
  code?: string | null;
}

const PAYMENT_CODES = new Set(["insufficient_quota", "billing_hard_limit_reached"]);

/** Words a provider uses for an account that cannot pay for the call. */
const PAYMENT_TEXT =
  /insufficient[ _-]?quota|credit balance is too low|insufficient[ _-]?(?:balance|credits?|funds)|payment required|billing (?:hard )?limit|no credits? (?:remaining|left)|out of credits?|exhausted your credits?|requires more credits|top up your (?:balance|credits)/i;

/** Words for a key that has used up, or never had, quota for this model. */
const QUOTA_TEXT =
  /quota|RESOURCE_EXHAUSTED|free[ _-]?tier|limit:\s*0\b|daily limit/i;

/** Words for a model the provider does not serve to this key. */
const NOT_FOUND_TEXT =
  /model[^.]{0,80}?(?:not found|does not exist|is not supported for|no longer available)|is not found for API version|NOT_FOUND|no longer available to new users|unknown model|model_not_found|invalid model(?: id)?\b/i;

/** Words for a refused key on a status that does not say so (Gemini's 400). */
const AUTH_TEXT =
  /api key not valid|invalid[ _-]?api[ _-]?key|incorrect api key|API_KEY_INVALID|PERMISSION_DENIED|unauthori[sz]ed/i;

const NETWORK_TEXT = /fetch failed|network error|socket hang up|ECONNREFUSED|ENOTFOUND|ECONNRESET/i;

/**
 * The failure class of one refused call. Account classes (`payment`, `quota`,
 * `not_found`, `auth`) are read from the words before the status, because the
 * status a provider picks for them differs from provider to provider.
 */
export function classifyProviderFailure(
  signals: ProviderFailureSignals
): ProviderFailureKind {
  const status = signals.status ?? null;
  const message = signals.message ?? "";
  const code = signals.code ?? "";

  if (status === 401 || status === 403) return "auth";
  if (status === 402 || PAYMENT_CODES.has(code) || PAYMENT_TEXT.test(message)) {
    return "payment";
  }
  if (status === 404) return "not_found";
  if (status === 429 || /RESOURCE_EXHAUSTED/.test(message)) {
    return QUOTA_TEXT.test(message) ? "quota" : "rate_limit";
  }
  if (status === 408 || status === 504) return "timeout";
  if (status !== null && status >= 500) return "server";
  if (NOT_FOUND_TEXT.test(message)) return "not_found";
  if (AUTH_TEXT.test(message)) return "auth";
  if (status !== null && status >= 400) return "client";
  if (NETWORK_TEXT.test(message)) return "network";
  if (/\btimed? ?out\b/i.test(message)) return "timeout";
  if (/rate[ _-]?limit|too many requests/i.test(message)) return "rate_limit";
  return "unknown";
}

/**
 * Classes the user fixes on their account or in the model picker. A surface
 * offers a model switch for these. The others are retried or reported.
 */
export function isAccountProviderFailure(kind: string): boolean {
  return (
    kind === "auth" ||
    kind === "payment" ||
    kind === "quota" ||
    kind === "not_found"
  );
}
