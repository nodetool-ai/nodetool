/**
 * Actionable text for opaque provider failures.
 *
 * Providers surface upstream HTTP errors verbatim — `403 Your request was
 * blocked.`, `401 Incorrect API key provided`, `fetch failed` — which reaches
 * the user as a node error with no hint of which provider failed or what to do
 * about it. {@link annotateProviderError} appends the provider, the model, and
 * a short remedy for the status class, leaving the original text at the front
 * so existing message matching (rate limit, context length) still works.
 */

import { getProviderSecretKey } from "./provider-registry.js";
import { isNumber, isObjectLike, isString } from "@nodetool-ai/protocol";

/** Marks an error already annotated, so nested wrappers don't stack hints. */
const ANNOTATED = Symbol.for("nodetool.provider.errorAnnotated");

/**
 * Machine-readable companion to the prose hint. Surfaces that want to *act* on
 * a failure — reopen provider onboarding on the failing key, say — read this
 * instead of matching the message text.
 */
export interface ProviderFailureDetail {
  /**
   * `provider_auth`: the credential was refused. `context_exceeded`: the
   * request did not fit the model's context window, which a caller holding the
   * transcript can answer by shortening it and retrying.
   */
  code: "provider_auth" | "context_exceeded";
  /** Provider id as the runtime knows it (e.g. `openai`). */
  provider: string;
  /** Secret key holding that provider's credential, when one is registered. */
  secretKey: string | null;
}

/** Field carrying {@link ProviderFailureDetail} on an annotated error. */
const FAILURE_DETAIL = Symbol.for("nodetool.provider.failureDetail");

interface ErrorLike {
  status?: unknown;
  statusCode?: unknown;
  response?: { status?: unknown };
  code?: unknown;
  name?: unknown;
  message?: unknown;
  [ANNOTATED]?: boolean;
  [FAILURE_DETAIL]?: ProviderFailureDetail;
}

/**
 * The structured detail {@link annotateProviderError} attached, or null when
 * the error is not a credential failure.
 */
export function providerFailureDetail(
  error: unknown
): ProviderFailureDetail | null {
  if (!isObjectLike(error)) return null;
  return (error as ErrorLike)[FAILURE_DETAIL] ?? null;
}

/**
 * Tag `error` as the provider refusing a request larger than the model's
 * context window. Kept apart from {@link annotateProviderError}: the prose hint
 * is written from an HTTP status, while this classification comes from the
 * provider's own overflow signal.
 */
export function markContextExceeded<TError>(
  error: TError,
  provider: string
): TError {
  if (!(error instanceof Error)) return error;
  (error as Error & ErrorLike)[FAILURE_DETAIL] = {
    code: "context_exceeded",
    provider,
    secretKey: null
  };
  return error;
}

function numericStatus(value: unknown): number | null {
  const status = isString(value) ? Number(value) : value;
  if (!isNumber(status) || !Number.isInteger(status)) return null;
  return status >= 100 && status <= 599 ? status : null;
}

/**
 * HTTP status carried by a provider error: a `status`/`statusCode` field when
 * the provider throws a typed error, otherwise a status token at the start of
 * the message (`"403 Your request was blocked."`, the shape both the `openai`
 * SDK and {@link OpenAICompatError} use) or after an explicit `status`/`HTTP`
 * marker. Bare three-digit numbers elsewhere in the message are ignored — they
 * are far more often model ids or token counts than statuses.
 */
export function httpStatusFromError(error: unknown): number | null {
  if (!isObjectLike(error)) return null;
  const candidate = error as ErrorLike;
  const direct =
    numericStatus(candidate.status) ??
    numericStatus(candidate.statusCode) ??
    numericStatus(candidate.response?.status);
  if (direct !== null) return direct;

  const message = isString(candidate.message) ? candidate.message : "";
  const leading = message.match(/^\s*(\d{3})\b/);
  if (leading) return numericStatus(leading[1]);
  const labelled = message.match(
    /\b(?:status|http|status code)[:\s]+(\d{3})\b/i
  );
  return labelled ? numericStatus(labelled[1]) : null;
}

function isAbort(error: ErrorLike): boolean {
  const name = isString(error.name) ? error.name : "";
  if (name === "AbortError" || name === "TimeoutError") return true;
  const code = isString(error.code) ? error.code : "";
  return code === "ABORT_ERR";
}

const NETWORK_CODES = new Set([
  "ENOTFOUND",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "CERT_HAS_EXPIRED"
]);

function isNetworkFailure(error: ErrorLike): boolean {
  const code = isString(error.code) ? error.code : "";
  if (NETWORK_CODES.has(code)) return true;
  const message = isString(error.message) ? error.message : "";
  return /fetch failed|network error|socket hang up/i.test(message);
}

/** Remedy for one status class, or null when the status needs no advice. */
function hintForStatus(
  status: number,
  provider: string,
  model: string
): string | null {
  const target = model ? `${provider}/${model}` : provider;
  switch (status) {
    case 401:
      return `${target} rejected the credentials (401). Add or update the API key for ${provider} in Settings → Models & Providers.`;
    case 403:
      return `${target} refused the request (403). The API key may be missing access to this model, restricted to certain referrers or IPs, or blocked in your region — check it in Settings → Models & Providers.`;
    case 402:
      return `${target} reports the account is out of credit (402). Top up or check billing with ${provider}.`;
    case 404:
      return `${target} does not expose this model (404). Pick another model, or check that your ${provider} account has access to it.`;
    case 429:
      return `${target} is rate limiting or out of quota (429). Wait and retry, or check your ${provider} plan limits.`;
    case 408:
    case 504:
      return `${target} timed out (${status}). Retry, or lower the request size.`;
    default:
      if (status >= 500) {
        return `${target} is failing on its side (${status}). Retry in a moment; if it persists, check the ${provider} status page.`;
      }
      return null;
  }
}

function hintFor(
  error: ErrorLike,
  provider: string,
  model: string
): string | null {
  const status = httpStatusFromError(error);
  if (status !== null) return hintForStatus(status, provider, model);
  if (isNetworkFailure(error)) {
    const target = model ? `${provider}/${model}` : provider;
    return `Could not reach ${target}. Check your internet connection, proxy settings, and — for local providers — that the server is running.`;
  }
  return null;
}

/**
 * Append provider context and a remedy to a provider failure, in place. The
 * original message is kept as the prefix, and the error object (class, status,
 * stack) is left intact. Aborts and already-annotated errors pass through
 * untouched. Returns the same error so callers can `throw annotateProviderError(...)`.
 */
export function annotateProviderError<TError>(
  error: TError,
  context: { provider: string; model?: string }
): TError {
  if (!(error instanceof Error)) return error;
  const candidate = error as Error & ErrorLike;
  if (candidate[ANNOTATED] || isAbort(candidate)) return error;

  // "unknown" is the modality wrappers' placeholder when the params carry no
  // model id; naming it would read as a model called "unknown".
  const model =
    context.model && context.model !== "unknown" ? context.model : "";
  const hint = hintFor(candidate, context.provider, model);
  if (!hint) return error;

  // 401/403 both mean "the credential didn't work" as far as a user is
  // concerned — one is rejected, the other refused — and both are fixed on the
  // same screen, so both carry the structured detail.
  const status = httpStatusFromError(candidate);
  if (status === 401 || status === 403) {
    candidate[FAILURE_DETAIL] = {
      code: "provider_auth",
      provider: context.provider,
      secretKey: getProviderSecretKey(context.provider)
    };
  }

  candidate[ANNOTATED] = true;
  const original = candidate.message.trim();
  candidate.message = original ? `${original} — ${hint}` : hint;
  return error;
}
