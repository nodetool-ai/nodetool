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
    if ("value" in value && typeof value.value === "string") return value.value;
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("data" in value && typeof value.data === "string") return value.data;
    if ("content" in value && typeof value.content === "string")
      return value.content;
    if ("output" in value) return extractTextValue(value.output);
  }
  return "";
};
