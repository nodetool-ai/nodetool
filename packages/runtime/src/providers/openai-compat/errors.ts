/**
 * Typed error for OpenAI-compatible HTTP endpoints.
 *
 * The message deliberately mirrors the `openai` SDK's `APIError` format —
 * `"<status> <upstream message>"` — because callers classify failures by
 * matching on `String(error)` (BaseProvider.isRateLimitError looks for `429` /
 * "rate limit", isContextLengthError for "context length", …).
 */
import { isNumber, isString } from "@nodetool-ai/protocol";

export class OpenAICompatError extends Error {
  /** HTTP status; `undefined` for mid-stream error events with no status. */
  readonly status: number | undefined;
  readonly code: string | null;
  readonly type: string | null;
  readonly param: string | null;
  /** The parsed error body (or raw text when not JSON). */
  readonly body: unknown;

  constructor(
    status: number | undefined,
    message: string,
    details: {
      code?: string | null;
      type?: string | null;
      param?: string | null;
      body?: unknown;
    } = {}
  ) {
    super(status === undefined ? message : `${status} ${message}`);
    this.name = "OpenAICompatError";
    this.status = status;
    this.code = details.code ?? null;
    this.type = details.type ?? null;
    this.param = details.param ?? null;
    this.body = details.body;
  }
}

interface ParsedErrorBody {
  message: string;
  code: string | null;
  type: string | null;
  param: string | null;
  body: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return isString(value) ? value : null;
}

/**
 * Extract the human-readable message (and code/type/param) from an
 * OpenAI-style error payload: `{"error": {"message": …, "code": …}}`, a
 * top-level `{"message": …}`, or plain text.
 */
export function parseErrorBody(text: string): ParsedErrorBody {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { message: text, code: null, type: null, param: null, body: text };
  }

  const root = isRecord(parsed) ? parsed : {};
  const err = isRecord(root.error) ? root.error : root;
  const message =
    stringOrNull(err.message) ??
    (isString(root.error) ? root.error : null) ??
    text;

  return {
    message,
    code:
      stringOrNull(err.code) ?? (isNumber(err.code) ? String(err.code) : null),
    type: stringOrNull(err.type),
    param: stringOrNull(err.param),
    body: parsed
  };
}

/** Map a non-2xx HTTP response body to an {@link OpenAICompatError}. */
export function errorFromResponse(
  status: number,
  bodyText: string
): OpenAICompatError {
  const parsed = parseErrorBody(bodyText);
  return new OpenAICompatError(status, parsed.message, parsed);
}

/**
 * Map one `error` value — wherever it sat in the payload — to an
 * {@link OpenAICompatError}. `payload` is the whole body or event, kept for
 * the error's `body` so a caller logging the failure sees what arrived.
 * Returns `null` when `err` is absent or not an error shape.
 */
function errorFromErrorValue(
  err: unknown,
  payload: unknown,
  fallbackMessage: string
): OpenAICompatError | null {
  if (err === undefined || err === null) return null;
  if (isString(err)) {
    return new OpenAICompatError(undefined, err, { body: payload });
  }
  if (!isRecord(err)) return null;
  const message = stringOrNull(err.message) ?? fallbackMessage;
  // A numeric `code` is the HTTP status on a gateway that reports the failure
  // in a 200 body (OpenRouter mirrors the status there). Taking it as the
  // status is what keeps `BaseProvider.isRateLimitError` — which matches on
  // `String(error)` — working for a 429 that never reached the status line.
  const codeStatus =
    isNumber(err.code) && err.code >= 100 && err.code <= 599
      ? err.code
      : undefined;
  const status = isNumber(err.status)
    ? err.status
    : isNumber(err.http_status)
      ? err.http_status
      : codeStatus;
  return new OpenAICompatError(status, message, {
    code:
      stringOrNull(err.code) ?? (isNumber(err.code) ? String(err.code) : null),
    type: stringOrNull(err.type),
    param: stringOrNull(err.param),
    body: payload
  });
}

/** The `error` carried by the payload's first choice, if any. */
function choiceError(payload: Record<string, unknown>): unknown {
  const choices = payload.choices;
  if (!Array.isArray(choices)) return undefined;
  const choice = choices[0];
  if (!isRecord(choice)) return undefined;
  // Streaming puts it on the delta on some gateways, non-streaming on the
  // choice itself; the choice's own field wins when both are present.
  if (choice.error !== undefined && choice.error !== null) return choice.error;
  const delta = choice.delta;
  return isRecord(delta) ? delta.error : undefined;
}

/**
 * Map a mid-stream SSE error event to an {@link OpenAICompatError}. Returns
 * `null` when the event is not an error.
 *
 * The error rides at the top level (`{"error": {...}}`) or inside the first
 * choice — OpenRouter reports a failure that happens after the stream opened
 * as a `finish_reason: "error"` choice, because the 200 status is already on
 * the wire by then.
 */
export function errorFromStreamEvent(
  event: Record<string, unknown>
): OpenAICompatError | null {
  return (
    errorFromErrorValue(event.error, event, "stream error") ??
    errorFromErrorValue(choiceError(event), event, "stream error")
  );
}

/**
 * Map an error carried by a *successful* (HTTP 200) chat-completion body to an
 * {@link OpenAICompatError}. Returns `null` for an ordinary completion.
 *
 * A gateway that has already committed a 200 cannot report a later failure in
 * the status, so it reports it in the body instead — OpenRouter's API
 * reference says to check the body for an `error` field even on a 200 rather
 * than relying on the status alone. Without this the body reaches
 * {@link decodeChatCompletion}, which sees no `choices` and answers "no
 * choices" — a diagnosis that names neither the endpoint nor the reason.
 */
export function errorFromOkBody(body: unknown): OpenAICompatError | null {
  if (!isRecord(body)) return null;
  return (
    errorFromErrorValue(body.error, body, "chat completion failed") ??
    errorFromErrorValue(choiceError(body), body, "chat completion failed")
  );
}
