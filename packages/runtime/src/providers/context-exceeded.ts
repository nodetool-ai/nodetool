/**
 * Recognizing "the prompt did not fit the model's context window".
 *
 * Each provider reports the overflow its own way, and a caller that cannot tell
 * it apart from any other failure has nothing to do but hand the user a
 * provider error they cannot act on. Mapping every provider's signal onto one
 * code is what lets the caller shorten the transcript and try again.
 *
 * A recognizer takes what its provider produces on that failure — the parsed
 * error body from the wire, or the `Error` the provider threw carrying it — and
 * names the signal that fired, so a check can tell a match on the provider's
 * documented field apart from a match on its English message text.
 *
 * Where the signals come from:
 * - **Anthropic**: `stop_reason: "model_context_window_exceeded"` (the SDK's
 *   `BetaStopReason` union) when generation runs into the window, and a 400
 *   `invalid_request_error` reading "prompt is too long" when the input alone
 *   overflows it. Both are stated in the Claude API's "Context window overflow
 *   behavior". Older models answer the same overflow with "input length and
 *   `max_tokens` exceed context limit".
 * - **OpenAI**: `error.code: "context_length_exceeded"` on a 400
 *   `invalid_request_error`; the `openai` SDK lifts that field onto
 *   `APIError.code`. The message reads "This model's maximum context length
 *   is …".
 * - **Gemini**: HTTP 400 `INVALID_ARGUMENT` whose message reads "The input
 *   token count (N) exceeds the maximum number of tokens allowed (M)". Google's
 *   error reference enumerates no code for it, so the message is the signal.
 */

import { isRecord, isString } from "../type-predicates.js";

/** Which of a provider's signals identified the overflow. */
export type ContextExceededSignal = "stop_reason" | "error_code" | "message";

interface FailureFields {
  message: string;
  code: string;
  stopReason: string;
}

function stringField(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return isString(value) ? value : "";
}

/**
 * The fields to test, read from either shape a recognizer is handed: a parsed
 * response body, which nests the failure under `error`, or an SDK error object,
 * which carries that nested body on `.error` and lifts `code` onto itself.
 */
function failureFields(raw: unknown): FailureFields {
  const roots: Record<string, unknown>[] = [];
  if (isRecord(raw)) {
    roots.push(raw);
    if (isRecord(raw.error)) roots.push(raw.error);
  }
  const fields: FailureFields = { message: "", code: "", stopReason: "" };
  for (const root of roots) {
    fields.message = fields.message || stringField(root, "message");
    fields.code = fields.code || stringField(root, "code");
    fields.stopReason = fields.stopReason || stringField(root, "stop_reason");
  }
  return fields;
}

const ANTHROPIC_STOP_REASON = "model_context_window_exceeded";
const ANTHROPIC_OVERFLOW =
  /prompt is too long|exceed context limit|exceeds context limit/i;

/** @see {@link ContextExceededSignal} for what the return value names. */
export function anthropicContextExceeded(
  raw: unknown
): ContextExceededSignal | null {
  const { message, stopReason } = failureFields(raw);
  // The provider turns that stop reason into an error of its own, so the name
  // is matched in text as well as in the field it arrived on.
  if (stopReason === ANTHROPIC_STOP_REASON) return "stop_reason";
  if (message.includes(ANTHROPIC_STOP_REASON)) return "stop_reason";
  if (ANTHROPIC_OVERFLOW.test(message)) return "message";
  return null;
}

const OPENAI_ERROR_CODE = "context_length_exceeded";
const OPENAI_OVERFLOW = /maximum context length|context window of this model/i;

/** @see {@link ContextExceededSignal} for what the return value names. */
export function openAIContextExceeded(
  raw: unknown
): ContextExceededSignal | null {
  const { message, code } = failureFields(raw);
  if (code === OPENAI_ERROR_CODE) return "error_code";
  if (OPENAI_OVERFLOW.test(message)) return "message";
  return null;
}

const GEMINI_MAX_TOKENS = "exceeds the maximum number of tokens allowed";
const GEMINI_TOKEN_COUNT = "input token count";
const GEMINI_EXCEEDS = "exceeds";

/**
 * Gemini's overflow message, scanned rather than matched with a pattern.
 *
 * The wildcard form of this — `input token count[^.]*exceeds` — is quadratic on
 * a message that repeats "input token count" and never says "exceeds": each
 * repetition is another start position from which the engine runs to the end
 * and backtracks. On 20 000 repetitions it takes ten seconds. The message is
 * provider text, so its shape is not ours to bound, which is why the pattern is
 * replaced rather than annotated.
 *
 * Scanning says the same thing in linear time: the count and the verb in one
 * sentence. Only the first occurrence is considered, which is the one in the
 * message Google documents; walking every occurrence would restore the
 * quadratic scan this exists to remove.
 */
function geminiOverflowMessage(message: string): boolean {
  const text = message.toLowerCase();
  if (text.includes(GEMINI_MAX_TOKENS)) return true;
  const start = text.indexOf(GEMINI_TOKEN_COUNT);
  if (start === -1) return false;
  const rest = text.slice(start + GEMINI_TOKEN_COUNT.length);
  const stop = rest.indexOf(".");
  return (stop === -1 ? rest : rest.slice(0, stop)).includes(GEMINI_EXCEEDS);
}

/** @see {@link ContextExceededSignal} for what the return value names. */
export function geminiContextExceeded(
  raw: unknown
): ContextExceededSignal | null {
  const { message } = failureFields(raw);
  return geminiOverflowMessage(message) ? "message" : null;
}
