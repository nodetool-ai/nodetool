import { isRecord, isString } from "@nodetool-ai/protocol";
import { countTokens } from "../token-counter.js";
import type { ChatCompletionsRequest } from "./openai-compat/index.js";

const failureMessages = new WeakMap<Error, string>();

/** Safe diagnostic generated from request counts, without upstream error text. */
export function groqRequestFailureMessage(error: unknown): string | null {
  return error instanceof Error ? (failureMessages.get(error) ?? null) : null;
}

export interface GroqRequestTokenEstimate {
  /** Estimated input tokens in the converted messages and tool definitions. */
  inputTokens: number;
  /** Estimated tokens in converted system messages. */
  systemTokens: number;
  /** Estimated tokens in all other converted messages. */
  messageTokens: number;
  /** Estimated tokens in the serialized tool definitions. */
  toolTokens: number;
}

export type GroqRequestFailureKind = "request_too_large" | "quota_exhausted";

export interface GroqRequestFailureDiagnostic {
  kind: GroqRequestFailureKind;
  estimate: GroqRequestTokenEstimate;
  /** Vendor-reported input allowance, when the error included it. */
  limitTokens: number | null;
  /** Vendor-reported requested input tokens, when the error included it. */
  requestedTokens: number | null;
}

function serializedTokenCount(value: unknown): number {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return 0;
  }
  return serialized === undefined ? 0 : countTokens(serialized);
}

/**
 * Estimate the final converted request, after message and tool serialization.
 * This is a cl100k proxy, not a Groq billing or model tokenizer count.
 */
export function estimateGroqRequestTokens(
  request: ChatCompletionsRequest
): GroqRequestTokenEstimate {
  let systemTokens = 0;
  let messageTokens = 0;
  for (const message of request.messages) {
    const tokens = serializedTokenCount(message);
    if (message.role === "system") {
      systemTokens += tokens;
    } else {
      messageTokens += tokens;
    }
  }

  const toolTokens =
    Array.isArray(request.tools) && request.tools.length > 0
      ? serializedTokenCount(request.tools)
      : 0;
  return {
    inputTokens: systemTokens + messageTokens + toolTokens,
    systemTokens,
    messageTokens,
    toolTokens
  };
}

function errorText(error: unknown): string {
  if (!isRecord(error)) {
    return String(error);
  }
  const message = isString(error.message) ? error.message : "";
  if (message) {
    return message;
  }
  const body = isRecord(error.body) ? error.body : null;
  const nested = body && isRecord(body.error) ? body.error : body;
  return nested && isString(nested.message) ? nested.message : "";
}

function errorCode(error: unknown): string {
  if (!isRecord(error)) {
    return "";
  }
  if (isString(error.code)) {
    return error.code;
  }
  const body = isRecord(error.body) ? error.body : null;
  const nested = body && isRecord(body.error) ? body.error : body;
  return nested && isString(nested.code) ? nested.code : "";
}

function reportedCount(
  text: string,
  label: "limit" | "requested"
): number | null {
  const match = text.match(
    new RegExp(`${label}\\s*[:=]?\\s*([0-9][0-9,]*)`, "i")
  );
  if (!match) {
    return null;
  }
  const value = Number(match[1].replaceAll(",", ""));
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Recognize Groq's request-size and TPM errors without treating every 429 as
 * a prompt overflow. The comparison uses the vendor's reported counts when
 * present, preserving the distinction between one oversized request and a
 * temporarily exhausted per-minute allowance.
 */
export function groqRequestFailureDiagnostic(
  error: unknown,
  estimate: GroqRequestTokenEstimate
): GroqRequestFailureDiagnostic | null {
  const text = errorText(error);
  const hasRequestSizeSignal =
    /request\s+too\s+large|prompt\s+too\s+large/i.test(text);
  const hasTpmSignal = /tokens?\s+per\s+minute|\b(?:tpm|itpm)\b/i.test(text);
  if (!hasRequestSizeSignal && !hasTpmSignal) {
    return null;
  }

  const limitTokens = reportedCount(text, "limit");
  const requestedTokens = reportedCount(text, "requested");
  if (
    !hasRequestSizeSignal &&
    (limitTokens === null || requestedTokens === null)
  ) {
    return null;
  }
  const countsShowRequestOverLimit =
    limitTokens !== null &&
    requestedTokens !== null &&
    requestedTokens > limitTokens;
  const countsShowTemporaryExhaustion =
    limitTokens !== null &&
    requestedTokens !== null &&
    requestedTokens <= limitTokens;
  const kind =
    countsShowRequestOverLimit ||
    (hasRequestSizeSignal && !countsShowTemporaryExhaustion)
      ? "request_too_large"
      : "quota_exhausted";

  return { kind, estimate, limitTokens, requestedTokens };
}

function formatted(value: number): string {
  return value.toLocaleString("en-US");
}

/** Add bounded, actionable context while retaining the original Error object. */
export function annotateGroqRequestFailure(
  error: unknown,
  diagnostic: GroqRequestFailureDiagnostic
): unknown {
  if (!(error instanceof Error)) {
    return error;
  }

  const requested =
    diagnostic.requestedTokens ?? diagnostic.estimate.inputTokens;
  const limit = diagnostic.limitTokens;
  const counts =
    diagnostic.requestedTokens === null
      ? `estimated ${formatted(requested)} input tokens`
      : limit === null
        ? `requested ${formatted(requested)} input tokens`
        : `requested ${formatted(requested)} input tokens against a ${formatted(limit)} token limit`;
  const estimate =
    `local estimate ${formatted(diagnostic.estimate.inputTokens)} ` +
    `(system ${formatted(diagnostic.estimate.systemTokens)}, messages ${formatted(diagnostic.estimate.messageTokens)}, tools ${formatted(diagnostic.estimate.toolTokens)})`;
  const guidance =
    diagnostic.kind === "request_too_large"
      ? `Groq rejected an oversized request (${counts}; ${estimate}). Please reduce the prompt, conversation history, or tool definitions, or use a plan with a higher limit.`
      : `Groq's token allowance is temporarily exhausted (${counts}; ${estimate}). Please retry after the current minute or check the Groq plan limit.`;

  failureMessages.set(error, guidance);
  error.message = `${error.message} — ${guidance}`;
  return error;
}

export function groqContextExceeded(error: unknown): boolean {
  const text = errorText(error);
  if (
    /tokens?\s+per\s+minute|\b(?:tpm|itpm)\b|(?:request|prompt)\s+too\s+large/i.test(
      text
    )
  ) {
    return false;
  }
  return (
    errorCode(error) === "context_length_exceeded" ||
    /context_length_exceeded|maximum context length|context window/i.test(text)
  );
}
