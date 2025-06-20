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
