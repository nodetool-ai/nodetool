/** Split a `data:` URI into its MIME type and base64 payload. Non-base64 payloads are percent-decoded, then encoded. */
export function parseDataUri(uri: string) {
  const idx = uri.indexOf(",");
  if (idx < 0) {
    throw new Error("Invalid data URI");
  }
  const header = uri.slice(5, idx);
  const payload = uri.slice(idx + 1);
  const isBase64 = header.includes(";base64");
  const mime = header.split(";")[0] || "application/octet-stream";
  if (isBase64) {
    return { mime, base64: payload };
  }
  return {
    mime,
    base64: Buffer.from(decodeURIComponent(payload), "utf8").toString("base64")
  };
}
