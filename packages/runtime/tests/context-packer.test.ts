/**
 * Tests for T-MSG-1: Context packer.
 */
import { describe, it, expect } from "vitest";
import { packContext } from "../src/context-packer.js";
import type { Message } from "../src/providers/types.js";

function msg(role: Message["role"], text: string): Message {
  return { role, content: text };
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

describe("T-MSG-1: packContext", () => {
  it("returns all messages when within budget", () => {
    const messages = [msg("user", "hello"), msg("assistant", "hi")];
    const result = packContext(messages, "You are helpful.", 1000);
    expect(result.messages).toEqual(messages);
    expect(result.systemPrompt).toBe("You are helpful.");
  });

  it("truncates oldest messages first to fit budget", () => {
    const messages = [
      msg("user", "first message that is quite long to use tokens"),
      msg("user", "second message"),
      msg("assistant", "reply")
    ];
    // Budget tight enough to force dropping the first message
    const sysPrompt = "sys";
    const sysTokens = estimateTokens(sysPrompt);
    const msg2Tokens = estimateTokens("second message");
    const msg3Tokens = estimateTokens("reply");
    // Budget = system + last 2 messages + small margin
    const budget = sysTokens + msg2Tokens + msg3Tokens + 2;

    const result = packContext(messages, sysPrompt, budget);
    expect(result.messages.length).toBeLessThan(messages.length);
    // Most recent messages kept
    expect(result.messages[result.messages.length - 1]).toEqual(messages[2]);
  });

  it("truncates system prompt when it alone exceeds budget", () => {
    const longPrompt = "a".repeat(400); // ~100 tokens
    const result = packContext([], longPrompt, 10);
    expect(estimateTokens(result.systemPrompt)).toBeLessThanOrEqual(10);
    expect(result.systemPrompt.length).toBeLessThan(longPrompt.length);
  });

  it("handles empty messages array", () => {
    const result = packContext([], "system", 100);
    expect(result.messages).toEqual([]);
    expect(result.systemPrompt).toBe("system");
  });

  it("handles empty system prompt", () => {
    const messages = [msg("user", "hi")];
    const result = packContext(messages, "", 100);
    expect(result.systemPrompt).toBe("");
    expect(result.messages).toEqual(messages);
  });

  it("keeps at least the most recent message when possible", () => {
    const messages = [msg("user", "old message"), msg("user", "new")];
    const sysPrompt = "s";
    // Budget for system + last message only
    const budget = estimateTokens("s") + estimateTokens("new") + 1;
    const result = packContext(messages, sysPrompt, budget);
    expect(result.messages.length).toBeGreaterThanOrEqual(1);
    expect(result.messages[result.messages.length - 1]).toEqual(messages[1]);
  });

  it("estimates tokens from MessageContent array", () => {
    const messages: Message[] = [
      { role: "user", content: [{ type: "text", text: "hello world" }] }
    ];
    const result = packContext(messages, "sys", 1000);
    expect(result.messages).toEqual(messages);
  });

  it("drops all messages if budget only fits system prompt", () => {
    const messages = [msg("user", "a long message that takes many tokens")];
    const sysPrompt = "sys";
    // Only enough for system prompt
    const budget = estimateTokens(sysPrompt);
    const result = packContext(messages, sysPrompt, budget);
    expect(result.messages).toEqual([]);
  });
});
