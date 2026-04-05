/**
 * Token counting utilities for chat messages.
 *
 * Port of src/nodetool/chat/token_counter.py.
 *
 * Since tiktoken is not available in JS, this uses a simple word-based
 * approximation: split by whitespace and apply a ~0.75 ratio to account
 * for sub-word tokenization.
 */

import type { Message, ToolCall } from "@nodetool/runtime";

/**
 * Approximate token count for a plain text string.
 *
 * Uses whitespace splitting as a proxy. Most LLM tokenizers produce roughly
 * 1.3 tokens per whitespace-delimited word, so we multiply by 1.33 and round.
 */
export function countTextTokens(text: string | null | undefined): number {
  if (!text) return 0;
  const words = text.split(/\s+/).filter(Boolean);
  return Math.ceil(words.length * 1.33);
}

/**
 * Count tokens consumed by an array of tool calls.
 */
function countToolCallsTokens(
  toolCalls: ToolCall[] | null | undefined
): number {
  if (!toolCalls) return 0;
  let count = 0;
  for (const tc of toolCalls) {
    if (tc.name) {
      count += countTextTokens(tc.name);
    }
    if (tc.args) {
      try {
        count += countTextTokens(JSON.stringify(tc.args));
      } catch {
        // Be resilient to unexpected structures.
      }
    }
  }
  return count;
}

/**
 * Count tokens for a single Message.
 *
 * Handles `content` as a plain string or as an array of content parts
 * (only text parts are counted). Also counts tokens from any tool calls.
 */
export function countMessageTokens(message: Message): number {
  let tokenCount = 0;

  const content = message.content;
  if (content) {
    if (typeof content === "string") {
      tokenCount += countTextTokens(content);
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (part.type === "text") {
          tokenCount += countTextTokens(part.text);
        }
      }
    }
  }

  tokenCount += countToolCallsTokens(message.toolCalls ?? null);

  return tokenCount;
}

/**
 * Count tokens across an array of Messages.
 */
export function countMessagesTokens(messages: Message[]): number {
  let total = 0;
  for (const msg of messages) {
    total += countMessageTokens(msg);
  }
  return total;
}
