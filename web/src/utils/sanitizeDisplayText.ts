const DATA_URI_PATTERN = /data:([^;,]+)?;base64,[A-Za-z0-9+/=\r\n]+/gi;

const DEFAULT_MAX_DISPLAY_TEXT_LENGTH = 2000;

export function sanitizeDisplayText(
  text: string,
  maxLength = DEFAULT_MAX_DISPLAY_TEXT_LENGTH,
): string {
  const sanitized = text.replace(DATA_URI_PATTERN, (match, mimeType) => {
    const mime = typeof mimeType === "string" && mimeType !== "" ? mimeType : "data";
    return `[${mime} base64 omitted, ${match.length} chars]`;
  });

  if (sanitized.length <= maxLength) {
    return sanitized;
  }

  const truncatedChars = sanitized.length - maxLength;
  return `${sanitized.slice(0, maxLength)}... (truncated ${truncatedChars} chars)`;
}
