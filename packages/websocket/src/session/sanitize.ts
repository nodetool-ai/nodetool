import { isObjectLike, isString } from "../lib/wire-values.js";

const DATA_URI_PATTERN = /data:([^;,]{1,100})?;base64,[A-Za-z0-9+/=\r\n]+/gi;
const MAX_ERROR_TEXT_LENGTH = 4000;

export function sanitizeLargeText(
  text: string,
  maxLength = MAX_ERROR_TEXT_LENGTH
): string {
  const sanitized = text.replace(DATA_URI_PATTERN, (match, mimeType) => {
    const mime = isString(mimeType) && mimeType !== "" ? mimeType : "data";
    return `[${mime} base64 omitted, ${match.length} chars]`;
  });

  if (sanitized.length <= maxLength) {
    return sanitized;
  }

  const truncatedChars = sanitized.length - maxLength;
  return `${sanitized.slice(0, maxLength)}... (truncated ${truncatedChars} chars)`;
}

/** A value reduced to shapes a JSON frame can carry. */
export type JsonSafeValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | JsonSafeValue[]
  | { [key: string]: JsonSafeValue };

function sanitizeErrorValue(
  value: unknown,
  seen = new WeakSet<object>()
): JsonSafeValue {
  if (isString(value)) {
    return sanitizeLargeText(value);
  }

  if (value instanceof Error) {
    return sanitizeLargeText(value.message);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeErrorValue(item, seen));
  }

  if (isObjectLike(value)) {
    if (seen.has(value)) {
      return "[circular]";
    }

    seen.add(value);
    const result: { [key: string]: JsonSafeValue } = {};
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>
    )) {
      result[key] = sanitizeErrorValue(nested, seen);
    }
    return result;
  }

  // SAFETY: strings, errors, arrays and objects are handled above; what is
  // left is a JSON scalar.
  return value as JsonSafeValue;
}

export function formatSanitizedError(error: unknown): string {
  // A nullish error means "no error" — the kernel stamps `error: null` on every
  // node/job update. Never serialize that to the literal string "null" (via
  // JSON.stringify below), which clients would show as a bogus error message.
  if (error == null) {
    return "";
  }

  if (isString(error)) {
    return sanitizeLargeText(error);
  }

  if (error instanceof Error) {
    return sanitizeLargeText(error.message);
  }

  const sanitized = sanitizeErrorValue(error);
  if (isString(sanitized)) {
    return sanitized;
  }

  try {
    return sanitizeLargeText(JSON.stringify(sanitized));
  } catch {
    return sanitizeLargeText(String(error));
  }
}
