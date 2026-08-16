import { isObjectLike, isString } from "./typePredicates";
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
  if (isString(value)) {
    return value;
  }
  if (value && isObjectLike(value)) {
    if ("value" in value && isString(value.value)) return value.value;
    if ("text" in value && isString(value.text)) return value.text;
    if ("data" in value && isString(value.data)) return value.data;
    if ("content" in value && isString(value.content))
      return value.content;
    if ("output" in value) return extractTextValue(value.output);
  }
  return "";
};
