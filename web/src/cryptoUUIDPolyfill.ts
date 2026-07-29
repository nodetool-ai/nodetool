/**
 * Polyfill `crypto.randomUUID` for insecure browsing contexts.
 *
 * `crypto.randomUUID` is a secure-context-only API: it is `undefined` when the
 * app is served over plain http from anything other than `localhost` (e.g. a
 * LAN or server IP). The many call sites that use it directly then throw, which
 * breaks workflow/tab creation — the app works from `http://localhost` but not
 * from `http://<server-ip>`.
 *
 * `crypto.getRandomValues` is NOT gated to secure contexts, so we can build a
 * spec-correct v4 UUID everywhere. Only installs the fallback when the native
 * method is missing, so secure contexts keep the browser implementation.
 *
 * Must be imported before any module that calls `crypto.randomUUID` at load
 * time — keep it in the early-polyfills block at the top of `index.tsx`.
 */
type UUID = `${string}-${string}-${string}-${string}-${string}`;

const byteToHex: readonly string[] = Array.from({ length: 256 }, (_, i) =>
  (i + 0x100).toString(16).slice(1)
);

const randomUUIDFallback = (): UUID => {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
  const h = byteToHex;
  const uuid =
    `${h[b[0]]}${h[b[1]]}${h[b[2]]}${h[b[3]]}-` +
    `${h[b[4]]}${h[b[5]]}-${h[b[6]]}${h[b[7]]}-` +
    `${h[b[8]]}${h[b[9]]}-` +
    `${h[b[10]]}${h[b[11]]}${h[b[12]]}${h[b[13]]}${h[b[14]]}${h[b[15]]}`;
  return uuid as UUID;
};

if (
  typeof crypto !== "undefined" &&
  typeof crypto.getRandomValues === "function" &&
  typeof crypto.randomUUID !== "function"
) {
  Object.defineProperty(crypto, "randomUUID", {
    value: randomUUIDFallback,
    configurable: true,
    writable: true
  });
}

export {};
