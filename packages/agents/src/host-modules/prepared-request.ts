/**
 * The shape every auth-helper host module returns, and the argument checks
 * they share.
 *
 * An auth helper builds a request; it never sends one. The guest passes what
 * comes back to `fetch`, so the run's fetch cap, its SSRF guard, and its body
 * limit all still apply — moving the header math to the host must not move the
 * network call with it.
 */

/** A request ready for `fetch(prepared.url, prepared)`. */
import { isObjectLike, isString } from "../utils/type-guards.js";
export interface PreparedRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  /** Absent for a request with no body, so `fetch` sends none. */
  readonly body?: string;
}

/** Largest request body an auth helper will build, in characters. */
const MAX_BODY_CHARS = 1024 * 1024;

/** A required non-empty string argument, or a named error. */
export function requireString(
  where: string,
  value: unknown,
  label: string
): string {
  if (!isString(value) || value === "") {
    throw new Error(`${where}: ${label} is required`);
  }
  return value;
}

/** An HTTP method, uppercased, defaulting to `fallback`. */
export function methodOf(value: unknown, fallback: string): string {
  return value === undefined || value === null
    ? fallback
    : String(value).toUpperCase();
}

/** Serialize a JSON body, refusing one too large to be worth building. */
export function jsonBody(where: string, value: unknown): string {
  const text = JSON.stringify(value ?? {});
  if (text.length > MAX_BODY_CHARS) {
    throw new Error(
      `${where}: body exceeds the ${MAX_BODY_CHARS} character limit`
    );
  }
  return text;
}

/**
 * Append a query bag to a URL.
 *
 * `undefined` and `null` entries are dropped rather than sent as the strings
 * "undefined" and "null", which is what an optional filter should do. An array
 * repeats the key.
 */
export function withQuery(url: URL, query: unknown): URL {
  if (!isObjectLike(query)) return url;
  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null) continue;
        url.searchParams.append(key, String(item));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

/** Form-encode a parameter bag, dropping absent entries and repeating arrays. */
export function formBody(where: string, params: unknown): string {
  const encoded = new URLSearchParams();
  if (isObjectLike(params)) {
    for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item === undefined || item === null) continue;
          encoded.append(key, String(item));
        }
        continue;
      }
      encoded.set(key, String(value));
    }
  }
  const text = encoded.toString();
  if (text.length > MAX_BODY_CHARS) {
    throw new Error(
      `${where}: body exceeds the ${MAX_BODY_CHARS} character limit`
    );
  }
  return text;
}

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Base64 of a UTF-8 string.
 *
 * Written out rather than reached for through `btoa`, which is byte-oriented
 * and throws on anything past U+00FF — an API token is ASCII, but a password
 * with an accent in it should produce a header, not an exception.
 */
export function base64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const chunk =
      (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += BASE64_ALPHABET[(chunk >> 18) & 63];
    out += BASE64_ALPHABET[(chunk >> 12) & 63];
    out += i + 1 < bytes.length ? BASE64_ALPHABET[(chunk >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? BASE64_ALPHABET[chunk & 63] : "=";
  }
  return out;
}
