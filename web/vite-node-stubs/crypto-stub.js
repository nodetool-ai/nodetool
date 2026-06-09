// Minimal browser stub for `node:crypto`. Delegates randomUUID to the
// Web Crypto API. createHash is unsupported here.
export function randomUUID() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function createHash() {
  throw new Error("node:crypto.createHash not available in browser");
}

export function randomBytes(n) {
  const buf = new Uint8Array(n);
  globalThis.crypto.getRandomValues(buf);
  return buf;
}

export default { randomUUID, createHash, randomBytes };
