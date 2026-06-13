/**
 * Buffer-free base64 helpers shared by the `*-nodes` packages.
 *
 * `atob`/`btoa` are global on Node ≥ 16 and in every browser, so these work
 * in both environments without touching `node:buffer` (which the web bundle
 * stubs out).
 */

/** Decode a base64 string to bytes without `Buffer` (works on Node and browser). */
export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Encode bytes to a base64 string without `Buffer`. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
