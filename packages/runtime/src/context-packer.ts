/**
 * Context packer — T-MSG-1.
 *
 * Truncates a conversation to fit within a token budget.
 * Drops oldest messages first, keeping the most recent ones.
 * Token counts come from js-tiktoken (see `./token-counter.ts`).
 */

import type { Message, MessageContent } from "./providers/types.js";
import { countTokens, truncateToTokens } from "./token-counter.js";

/** Fixed token overhead for non-text content blocks (images, audio). */
const NON_TEXT_BLOCK_TOKENS = 25;

function estimateMessageTokens(msg: Message): number {
  let tokens = 0;
  if (msg.content === null || msg.content === undefined) {
    tokens = 1;
  } else if (typeof msg.content === "string") {
    tokens = countTokens(msg.content);
  } else {
    for (const part of msg.content as MessageContent[]) {
      tokens +=
        part.type === "text" ? countTokens(part.text) : NON_TEXT_BLOCK_TOKENS;
    }
  }
  for (const call of msg.toolCalls ?? []) {
    tokens += countTokens(call.name) + countTokens(JSON.stringify(call.args));
  }
  return tokens;
}

export interface PackedContext {
  messages: Message[];
  systemPrompt: string;
}

/**
 * Pack messages and system prompt into a token budget.
 *
 * Strategy:
 * 1. If system prompt exceeds budget, truncate it.
 * 2. Starting from the most recent message, add messages until budget exhausted.
 * 3. Oldest messages are dropped first.
 */
export function packContext(
  messages: Message[],
  systemPrompt: string,
  maxTokens: number
): PackedContext {
  let sysPrompt = systemPrompt;
  let sysTokens = countTokens(sysPrompt);

  // If system prompt alone exceeds budget, truncate it to the budget.
  if (sysTokens > maxTokens) {
    sysPrompt = truncateToTokens(sysPrompt, maxTokens);
    sysTokens = countTokens(sysPrompt);
  }

  let remaining = maxTokens - sysTokens;
  if (remaining <= 0) return { messages: [], systemPrompt: sysPrompt };

  // Walk messages from most recent to oldest
  const kept: Message[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const tokens = estimateMessageTokens(messages[i]);
    if (tokens <= remaining) {
      kept.unshift(messages[i]);
      remaining -= tokens;
    } else {
      break; // stop at the first message that doesn't fit
    }
  }

  return { messages: kept, systemPrompt: sysPrompt };
}
