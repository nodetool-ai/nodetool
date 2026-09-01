/**
 * Turns a thrown provider error into the `provider_call_failed` message the
 * UI reports with.
 *
 * A user who hits a 429 sees prose. What a maintainer needs is the provider,
 * the model, the status, the request id and the payload that was sent — and
 * asking the user to reconstruct that from a toast is how bug reports arrive
 * useless. {@link buildProviderCallFailure} assembles it once, at the same
 * place {@link logProviderRequestFailure} logs it, so every surface reports
 * the same record.
 */

import type { ProviderCallFailed } from "@nodetool-ai/protocol";
import { isObjectLike, isString } from "../type-predicates.js";
import { httpStatusFromError } from "./provider-error.js";
import { sanitizeForLog } from "./provider-request-log.js";

/** Strings in the reported request are capped harder than in a server log. */
const WIRE_SANITIZE = {
  maxStringLength: 400,
  maxArrayLength: 40,
  maxDepth: 8
} as const;

/**
 * Failure classes a surface can branch on. Derived from the status when there
 * is one, otherwise from the error's `code`/`name`.
 */
export type ProviderFailureKind =
  | "auth"
  | "payment"
  | "not_found"
  | "rate_limit"
  | "timeout"
  | "server"
  | "network"
  | "client"
  | "unknown";

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

export function providerFailureKind(error: unknown): ProviderFailureKind {
  const status = httpStatusFromError(error);
  if (status !== null) {
    if (status === 401 || status === 403) return "auth";
    if (status === 402) return "payment";
    if (status === 404) return "not_found";
    if (status === 429) return "rate_limit";
    if (status === 408 || status === 504) return "timeout";
    if (status >= 500) return "server";
    if (status >= 400) return "client";
  }
  if (!isObjectLike(error)) return "unknown";
  const candidate = error as { code?: unknown; name?: unknown; message?: unknown };
  const code = isString(candidate.code) ? candidate.code : "";
  if (NETWORK_CODES.has(code)) return "network";
  const name = isString(candidate.name) ? candidate.name : "";
  if (name === "TimeoutError") return "timeout";
  const message = isString(candidate.message) ? candidate.message : "";
  if (/fetch failed|network error|socket hang up/i.test(message)) {
    return "network";
  }
  return "unknown";
}

/**
 * Provider-side request id, under any of the names the SDKs use for it. It is
 * what a provider's support asks for first, so it is worth digging out.
 */
export function providerRequestId(error: unknown): string | null {
  if (!isObjectLike(error)) return null;
  const candidate = error as Record<string, unknown>;
  const headers = isObjectLike(candidate.headers)
    ? (candidate.headers as Record<string, unknown>)
    : undefined;
  const sources: unknown[] = [
    candidate.request_id,
    candidate.requestID,
    candidate.requestId,
    headers?.["x-request-id"],
    headers?.["x-amzn-requestid"],
    headers?.["cf-ray"]
  ];
  for (const value of sources) {
    if (isString(value) && value.trim() !== "") return value;
  }
  return null;
}

export interface ProviderCallFailureInput {
  provider: string;
  model?: string;
  /** Provider method that threw (e.g. `generateMessages`, `textToImage`). */
  operation: string;
  /** The wire payload the provider recorded, when it recorded one. */
  request?: unknown;
  /** NodeTool-level args, reported when no wire payload exists. */
  nodetoolArgs?: unknown;
  error: unknown;
  /** `Date.now()` when the call started, for the elapsed time. */
  startedAt?: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The message a surface reports with. `null` for a caller cancellation. */
export function buildProviderCallFailure(
  input: ProviderCallFailureInput,
  now: Date = new Date()
): ProviderCallFailed | null {
  if (isAbort(input.error)) return null;

  const hasWire = input.request !== undefined && input.request !== null;
  const payload = hasWire ? input.request : input.nodetoolArgs;
  const status = httpStatusFromError(input.error);
  const name = isObjectLike(input.error)
    ? (input.error as { name?: unknown }).name
    : undefined;

  return {
    type: "provider_call_failed",
    provider: input.provider,
    model: input.model && input.model !== "unknown" ? input.model : null,
    operation: input.operation,
    kind: providerFailureKind(input.error),
    status,
    message: errorMessage(input.error),
    error_name: isString(name) ? name : null,
    request_id: providerRequestId(input.error),
    duration_ms:
      input.startedAt !== undefined ? Date.now() - input.startedAt : null,
    request_source: payload === undefined ? null : hasWire ? "wire" : "nodetool-args",
    request: payload === undefined ? null : sanitizeForLog(payload, WIRE_SANITIZE),
    // Left null: the relay stamps the run onto every outbound message, and a
    // provider has no idea which workflow or job called it.
    workflow_id: null,
    job_id: null,
    timestamp: now.toISOString()
  };
}

/** A cancelled call is not a failure to report. */
function isAbort(error: unknown): boolean {
  if (!isObjectLike(error)) return false;
  const candidate = error as { name?: unknown; code?: unknown };
  if (isString(candidate.name) && /abort/i.test(candidate.name)) return true;
  return candidate.code === 20 || candidate.code === "ABORT_ERR";
}
