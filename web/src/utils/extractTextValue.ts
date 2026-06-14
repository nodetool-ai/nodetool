/**
 * Resolve the plain-text content from a node output value.
 *
 * Output values arrive in several shapes depending on the source: a raw
 * string, a `{ type: "text", text }` / `{ data }` / `{ value }` record, a
 * generation wrapper carrying `output`, or an array (e.g. chunked streaming
 * output) whose items resolve recursively and join with newlines. Anything
 * that doesn't resolve to text yields an empty string.
 */
export const extractTextValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value
      .map((item) => extractTextValue(item))
      .filter((item) => item.length > 0)
      .join("\n");
  }
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.value === "string") return v.value;
    if (typeof v.text === "string") return v.text;
    if (typeof v.data === "string") return v.data;
    if (typeof v.content === "string") return v.content;
    if (v.output !== undefined) return extractTextValue(v.output);
  }
  return "";
};
