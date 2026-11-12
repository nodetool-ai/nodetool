/**
 * Buffer-free base64 helpers shared by the `*-nodes` packages.
 *
 * `atob`/`btoa` are global on Node ≥ 16 and in every browser, so these work
 * in both environments without touching `node:buffer` (which the web bundle
 * stubs out).
 */

/** The native `Uint8Array` base64 methods (ES2026), where the engine has them. */
type NativeBase64 = {
  fromBase64?: (text: string) => Uint8Array;
  prototype: { toBase64?: (this: Uint8Array) => string };
};
// SAFETY: the intersection only adds optional members, and each is read only
// after a presence check.
const nativeBase64 = (): NativeBase64 =>
  Uint8Array as typeof Uint8Array & NativeBase64;

/**
 * Decode a base64 string to bytes without `Buffer` (works on Node and browser).
 * The native `Uint8Array.fromBase64` comes first, because the `atob` loop is
 * slow in the graph runner's QuickJS guest. Text it rejects takes the `atob`
 * path, which keeps the old errors.
 */
export function base64ToBytes(b64: string): Uint8Array {
  const { fromBase64 } = nativeBase64();
  if (fromBase64) {
    try {
      return fromBase64.call(Uint8Array, b64);
    } catch {
      // Not strict base64: atob below decides.
    }
  }
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Encode bytes to a base64 string without `Buffer`. */
export function bytesToBase64(bytes: Uint8Array): string {
  const { toBase64 } = nativeBase64().prototype;
  if (toBase64) return toBase64.call(bytes);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
