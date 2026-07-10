/**
 * Typed error for OpenAI-compatible HTTP endpoints.
 *
 * The message deliberately mirrors the `openai` SDK's `APIError` format —
 * `"<status> <upstream message>"` — because callers classify failures by
 * matching on `String(error)` (BaseProvider.isRateLimitError looks for `429` /
 * "rate limit", isContextLengthError for "context length", …).
 */
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
  return typeof value === "string" ? value : null;
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
    (typeof root.error === "string" ? root.error : null) ??
    text;

  return {
    message,
    code:
      stringOrNull(err.code) ??
      (typeof err.code === "number" ? String(err.code) : null),
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
 * Map a mid-stream SSE `{"error": {...}}` event to an
 * {@link OpenAICompatError}. Returns `null` when the event is not an error.
 */
export function errorFromStreamEvent(
  event: Record<string, unknown>
): OpenAICompatError | null {
  const err = event.error;
  if (err === undefined || err === null) return null;
  if (typeof err === "string") {
    return new OpenAICompatError(undefined, err, { body: event });
  }
  if (!isRecord(err)) return null;
  const message = stringOrNull(err.message) ?? "stream error";
  const status =
    typeof err.status === "number"
      ? err.status
      : typeof err.http_status === "number"
        ? err.http_status
        : undefined;
  return new OpenAICompatError(status, message, {
    code:
      stringOrNull(err.code) ??
      (typeof err.code === "number" ? String(err.code) : null),
    type: stringOrNull(err.type),
    param: stringOrNull(err.param),
    body: event
  });
}
