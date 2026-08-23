/**
 * Artifact redaction for the provider contract probes.
 *
 * A probe run keeps something about the live response so a human can read why
 * it failed, and a live response carries credentials in echoed headers, the
 * prompt, model output, request ids, and pre-signed result URLs. Rather than
 * denylisting those one by one — a list that is wrong the first time a
 * provider adds a field — the retained artifact is a *shape*: every leaf
 * becomes its type name, and only a small allowlist of enum-like keys keeps
 * its literal value. A probe checks structure, so structure is all it needs.
 */

/**
 * Keys whose values stay literal. Each is an enum or a small closed set that
 * carries no prompt, credential, identifier, or URL — and each is exactly what
 * a contract failure is usually about.
 */
export const SHAPE_LITERAL_KEYS: ReadonlySet<string> = new Set([
  "object",
  "role",
  "type",
  "state",
  "status",
  "code",
  "finish_reason",
  "finishReason",
  "blockReason",
  "mime_type",
  "mimeType",
  "content_type",
  "modality",
  "successFlag"
]);

/** Longest array the artifact keeps; the rest is reported as a count. */
const MAX_ARRAY_ITEMS = 3;
/** Deepest nesting the artifact keeps. */
const MAX_DEPTH = 8;

function literalKind(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * Reduce a value to its shape. Strings become `"string(len)"`, numbers
 * `"number"`, and so on; an allowlisted key keeps a short literal instead.
 */
export function summarizeShape(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "…";
  if (value === null) return "null";
  if (Array.isArray(value)) {
    const head = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => summarizeShape(item, depth + 1));
    return value.length > MAX_ARRAY_ITEMS
      ? [...head, `…${value.length - MAX_ARRAY_ITEMS} more`]
      : head;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SHAPE_LITERAL_KEYS.has(key)
        ? shortLiteral(item)
        : summarizeShape(item, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") return `string(${value.length})`;
  return literalKind(value);
}

/**
 * An allowlisted key's value, kept literal but bounded: a long string under an
 * allowlisted name is a value someone reused that key for, not an enum.
 */
function shortLiteral(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length <= 32 ? value : `string(${value.length})`;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  return summarizeShape(value);
}

/**
 * Redact free text a probe wants to keep — an error message, which can quote
 * a body. Strips anything that looks like a credential or a URL query string,
 * then truncates.
 */
export function redactText(text: string, maxLength = 400): string {
  const scrubbed = text
    // Bearer/Key headers and `"api_key": "…"`-style pairs.
    .replace(/\b(Bearer|Key)\s+[A-Za-z0-9._-]{8,}/gi, "$1 [redacted]")
    .replace(
      /("?(?:api[_-]?key|apikey|token|secret|password|authorization|credential)"?\s*[:=]\s*"?)[^",\s}]+/gi,
      "$1[redacted]"
    )
    // Credential-shaped tokens wherever they sit, including inside a message
    // a provider echoed back ("Incorrect API key provided: sk-…").
    .replace(
      /\b(?:sk|pk|rk|ak|gsk|xai|fal|kie|hf|nvapi|AIza)[-_][A-Za-z0-9_-]{8,}/gi,
      "[redacted-credential]"
    )
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted-token]")
    // Any URL: the path may identify a user and the query may sign it.
    .replace(/https?:\/\/[^\s"']+/gi, (url) => {
      try {
        return `${new URL(url).origin}/[redacted]`;
      } catch {
        return "[redacted-url]";
      }
    });
  return scrubbed.length > maxLength
    ? `${scrubbed.slice(0, maxLength)}…`
    : scrubbed;
}
