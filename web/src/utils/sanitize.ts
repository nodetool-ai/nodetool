export function sanitizeText(str: string): string {
  // Replace a handful of potentially dangerous characters with their HTML entity equivalents.
  // This is *not* a full XSS solution but is sufficient for plain-text replacement operations
  // where the string will ultimately be rendered as text, not HTML.
  const map: Record<string, string> = {
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
    "&": "&amp;"
  };

  return str.replace(/[<>"'&]/g, (char) => map[char] ?? char);
}

/**
 * Adds word break opportunities (<wbr>) after specific characters to improve text wrapping.
 * First escapes HTML entities to prevent XSS, then adds break opportunities after -, _, and .
 * @param text - The text to process
 * @returns Sanitized HTML with word break opportunities
 */
export function addBreaks(text: string): string {
  return sanitizeText(text).replace(/([-_.])/g, "$1<wbr>");
}
