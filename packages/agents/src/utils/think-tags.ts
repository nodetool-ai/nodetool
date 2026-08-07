/**
 * Reasoning-block removal, shared by every step loop.
 *
 * Some providers emit their scratchpad inline in the assistant text. It is not
 * part of the answer, so it must not reach a step result, agent memory, or the
 * user.
 */

/**
 * Strip well-formed PAIRED reasoning blocks from assistant text.
 *
 * Only matched pairs are removed (non-greedy). An open-ended pattern would
 * delete everything after the first literal "<think>", truncating an answer
 * that merely mentions the substring.
 */
export function removeThinkTags(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/<redacted_thinking>[\s\S]*?<\/redacted_thinking>/g, "")
    .trim();
}
