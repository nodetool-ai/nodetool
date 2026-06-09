// Minimal browser stub for `node:url`.
export function fileURLToPath(input) {
  const s = typeof input === "string" ? input : String(input);
  if (s.startsWith("file://")) return s.slice("file://".length);
  return s;
}

export function pathToFileURL(p) {
  const path = typeof p === "string" ? p : String(p);
  return new URL(`file://${path.startsWith("/") ? "" : "/"}${path}`);
}

export const URL = globalThis.URL;
export const URLSearchParams = globalThis.URLSearchParams;

export default {
  fileURLToPath,
  pathToFileURL,
  URL,
  URLSearchParams
};
