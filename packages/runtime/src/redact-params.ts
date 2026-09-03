/**
 * Redact a generation's parameters before they leave the process on a
 * `prediction` message or land in the ledger row.
 *
 * A generation request carries the media it conditions on — a seed image, a
 * reference clip — as bytes or `data:` URLs. The row wants the prompt, the
 * resolution and the duration, not a copy of the input. Bytes become their
 * length; long strings become their length; everything else is kept.
 */

const MAX_STRING_LENGTH = 2000;
const MAX_DEPTH = 8;

export type RedactedParams = Record<string, unknown>;

function isBinary(value: unknown): value is ArrayBufferView | ArrayBuffer {
  return ArrayBuffer.isView(value) || value instanceof ArrayBuffer;
}

function redactValue(value: unknown, depth: number): unknown {
  if (isBinary(value)) {
    return { bytes: value.byteLength };
  }
  if (typeof value === "string") {
    if (value.startsWith("data:")) {
      return { bytes: value.length, truncated: true };
    }
    if (value.length > MAX_STRING_LENGTH) {
      return { truncated: true, length: value.length };
    }
    return value;
  }
  if (depth >= MAX_DEPTH) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1));
  }
  if (value !== null && typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      // A class instance (a Date, a Map, a stream): not a parameter bag.
      return value;
    }
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = redactValue(item, depth + 1);
    }
    return out;
  }
  return value;
}

/** Redact a parameter bag. Never throws; a non-object comes back as `{}`. */
export function redactGenerationParams(
  params: Record<string, unknown> | null | undefined
): RedactedParams {
  if (!params || typeof params !== "object") return {};
  const redacted = redactValue(params, 0);
  return redacted !== null && typeof redacted === "object" && !Array.isArray(redacted)
    ? (redacted as RedactedParams)
    : {};
}
