/**
 * Reasoning text inside a chat message.
 *
 * Providers stream reasoning as chunks flagged `thinking: true`. The client
 * keeps it in the streaming message wrapped in `<think>` tags, the form
 * `parseThoughtContent` already renders, so it shows as a Reasoning row
 * instead of running into the answer. The server never persists reasoning, so
 * the finalized message arrives without it and the comparisons that match it
 * to its streaming placeholder must ignore the tags.
 */

export const THOUGHT_OPEN = "<think>";
export const THOUGHT_CLOSE = "<" + "/think>";
/** Some models close a `<think>` block with this tag instead. */
const REDACTED_THOUGHT_CLOSE = "<" + "/redacted_thinking>";

const THOUGHT_BLOCK = /<think>[\s\S]*?(?:<\/think>|<\/redacted_thinking>|$)/g;

/** True when the text ends inside a `<think>` block that has not closed. */
export const hasOpenThought = (text: string): boolean => {
  const open = text.lastIndexOf(THOUGHT_OPEN);
  if (open < 0) {
    return false;
  }
  return (
    text.indexOf(THOUGHT_CLOSE, open) < 0 &&
    text.indexOf(REDACTED_THOUGHT_CLOSE, open) < 0
  );
};

/** The text with every `<think>` block removed, closed or not. */
export const stripThoughtContent = (text: string): string =>
  text.includes(THOUGHT_OPEN) ? text.replace(THOUGHT_BLOCK, "") : text;

/**
 * Every `<think>` block in the text, each closed, joined in order. Empty when
 * the text has none.
 */
export const thoughtBlocks = (text: string): string => {
  const blocks = text.match(THOUGHT_BLOCK);
  if (!blocks) {
    return "";
  }
  return blocks
    .map((block) =>
      block.endsWith(THOUGHT_CLOSE) || block.endsWith(REDACTED_THOUGHT_CLOSE)
        ? block
        : block + THOUGHT_CLOSE
    )
    .join("");
};

/**
 * The text to append for one streamed chunk, given the text the message ends
 * with now. A reasoning chunk opens a `<think>` block when none is open; the
 * first answer chunk after reasoning, or the end of the stream, closes it.
 */
export const streamedChunkText = (
  trailingText: string,
  chunkText: string,
  thinking: boolean,
  done: boolean
): string => {
  const open = hasOpenThought(trailingText);
  if (thinking) {
    return open || chunkText.length === 0 ? chunkText : THOUGHT_OPEN + chunkText;
  }
  return open && (chunkText.length > 0 || done)
    ? THOUGHT_CLOSE + chunkText
    : chunkText;
};
