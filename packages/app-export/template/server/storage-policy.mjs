import { extname } from "node:path";

export function storageResponseHeaders(path) {
  return {
    "content-security-policy": "sandbox; default-src 'none'",
    "x-content-type-options": "nosniff",
    ...([".html", ".htm", ".svg", ".xml", ".xhtml"].includes(extname(path).toLowerCase()) && { "content-disposition": "attachment" })
  };
}
