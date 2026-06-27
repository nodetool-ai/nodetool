/**
 * Shared constants for the agents package.
 */

/** Maximum characters to retain from a single tool result. */
export const MAX_TOOL_RESULT_CHARS = 25_000;

/**
 * Cap a serialized tool result so a single oversized result can never blow past
 * a provider's message-content limit (e.g. Anthropic rejects content strings
 * over ~10 MB with "string too long") or balloon the context window. A broad
 * grep or a large file read can return tens of megabytes; without this the
 * whole turn fails on the next request.
 *
 * Returns `text` unchanged when it already fits. Otherwise keeps the first
 * `maxChars` characters and appends a notice telling the model the output was
 * cut and how to fetch a smaller slice.
 *
 * The cut is pulled back by one if it would land between the two halves of a
 * UTF-16 surrogate pair, so the kept prefix never ends in a lone surrogate
 * (which would render as U+FFFD and corrupt a multi-byte character).
 */
export function truncateToolResult(
  text: string,
  maxChars: number = MAX_TOOL_RESULT_CHARS
): string {
  if (text.length <= maxChars) return text;
  // Avoid splitting a surrogate pair: if the char just before the cut is a
  // high surrogate, it pairs with the low surrogate at `maxChars`, so drop it.
  const cut = isHighSurrogate(text.charCodeAt(maxChars - 1))
    ? maxChars - 1
    : maxChars;
  const omitted = text.length - cut;
  return (
    text.slice(0, cut) +
    `\n\n... [tool result truncated: kept first ${cut} of ${text.length} characters, ${omitted} omitted. ` +
    `Narrow the query, request a specific range, or use pagination/filters to retrieve a smaller result.]`
  );
}

/** True for a UTF-16 high surrogate code unit (the first half of a pair). */
function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}
