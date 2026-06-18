/**
 * Shared constants for the agents package.
 */

/** Default context window token limit shared across all executors. */
export const DEFAULT_TOKEN_LIMIT = 128_000;

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
 */
export function truncateToolResult(
  text: string,
  maxChars: number = MAX_TOOL_RESULT_CHARS
): string {
  if (text.length <= maxChars) return text;
  const omitted = text.length - maxChars;
  return (
    text.slice(0, maxChars) +
    `\n\n... [tool result truncated: kept first ${maxChars} of ${text.length} characters, ${omitted} omitted. ` +
    `Narrow the query, request a specific range, or use pagination/filters to retrieve a smaller result.]`
  );
}
