/**
 * Context packer — T-MSG-1.
 *
 * Truncates a conversation to fit within a token budget.
 * Drops oldest messages first, keeping the most recent ones.
 * Uses a simple estimate: 1 token ~ 4 characters.
 */

import type { Message, MessageContent } from "./providers/types.js";

function estimateMessageTokens(msg: Message): number {
  if (msg.content === null || msg.content === undefined) return 1;
  if (typeof msg.content === "string") return Math.ceil(msg.content.length / 4);
  // MessageContent array
  let chars = 0;
  for (const part of msg.content as MessageContent[]) {
    if (part.type === "text") {
      chars += part.text.length;
    } else {
      // image/audio — estimate a fixed overhead
      chars += 100;
    }
  }
  return Math.ceil(chars / 4);
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
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
  let sysTokens = estimateTokens(sysPrompt);

  // If system prompt alone exceeds budget, truncate it
  if (sysTokens > maxTokens) {
    const maxChars = maxTokens * 4;
    sysPrompt = sysPrompt.slice(0, maxChars);
    sysTokens = maxTokens;
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
