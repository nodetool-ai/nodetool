/**
 * Host→guest byte marshaling.
 *
 * Binary crosses the sandbox boundary asymmetrically. Guest→host is handled by
 * the typed-array serializers, so a guest `Uint8Array` reaches a host function
 * as a native one. Host→guest is not: a returned `Uint8Array` arrives in the
 * guest as a numeric-keyed plain object. Anything producing bytes therefore
 * returns a tagged base64 marker that the guest prelude rebuilds into a real
 * `Uint8Array`.
 *
 * It lives in its own module because both the sandbox itself and the host
 * module dispatcher marshal results, and the dispatcher is imported *by* the
 * sandbox.
 */

/** How deep the marshaler walks before it stops rewriting. */
export const SANDBOX_SERIALIZE_MAX_DEPTH = 32;

/** Marker key carrying base64 bytes from host to guest. */
export const SANDBOX_BYTES_MARKER = "__nodetool_sandbox_bytes__";

/** The base64 alphabet, also inlined into the guest prelude's own codec. */
export const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function encodeBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const c =
      (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out +=
      BASE64_ALPHABET[(c >> 18) & 63] +
      BASE64_ALPHABET[(c >> 12) & 63] +
      (i + 1 < bytes.length ? BASE64_ALPHABET[(c >> 6) & 63] : "=") +
      (i + 2 < bytes.length ? BASE64_ALPHABET[c & 63] : "=");
  }
  return out;
}

/** Base64 bytes tagged for the guest prelude to revive as a `Uint8Array`. */
export type GuestBytes = { readonly [SANDBOX_BYTES_MARKER]: string };

/**
 * What a host bridge hands the guest: JSON-shaped data, with byte payloads
 * carried as {@link GuestBytes} markers. Every host module export and every
 * bridge return value satisfies this contract — a function, a class instance,
 * or a live handle cannot cross the boundary.
 */
export type GuestValue =
  | null
  | undefined
  | boolean
  | number
  | string
  | GuestBytes
  | readonly GuestValue[]
  | { readonly [key: string]: GuestValue };

/** Tag bytes for the guest prelude to turn back into a real `Uint8Array`. */
export function toGuestBytes(bytes: Uint8Array): GuestBytes {
  return { [SANDBOX_BYTES_MARKER]: encodeBase64(bytes) };
}

/**
 * Same tagging, applied at any depth. A call that returns bytes inside a record
 * (`image.decode`'s `{width, height, pixels}`, a zip's entry map) hands its
 * result through this; the guest side pairs it with `__wrapDeep`, which revives
 * every marker.
 */
export function toGuestBytesDeep(value: unknown, depth = 0): unknown {
  if (value instanceof Uint8Array) return toGuestBytes(value);
  if (depth >= SANDBOX_SERIALIZE_MAX_DEPTH) return value;
  if (Array.isArray(value)) {
    return value.map((v) => toGuestBytesDeep(v, depth + 1));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = toGuestBytesDeep(v, depth + 1);
    }
    return out;
  }
  return value;
}
