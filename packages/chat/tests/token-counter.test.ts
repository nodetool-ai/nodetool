import { describe, it, expect } from "vitest";
import {
  countTextTokens,
  countMessageTokens,
  countMessagesTokens
} from "../src/token-counter.js";
import type { Message } from "@nodetool/runtime";

describe("countTextTokens", () => {
  it("returns 0 for null/undefined/empty", () => {
    expect(countTextTokens(null)).toBe(0);
    expect(countTextTokens(undefined)).toBe(0);
    expect(countTextTokens("")).toBe(0);
  });

  it("returns a positive count for non-empty text", () => {
    const count = countTextTokens("hello world");
    expect(count).toBeGreaterThan(0);
  });

  it("scales with text length", () => {
    const short = countTextTokens("hello");
    const long = countTextTokens(
      "hello world this is a longer sentence with more words"
    );
    expect(long).toBeGreaterThan(short);
  });
});

describe("countMessageTokens", () => {
  it("counts tokens for a string content message", () => {
    const msg: Message = { role: "user", content: "hello world" };
    expect(countMessageTokens(msg)).toBeGreaterThan(0);
  });

  it("counts tokens for array content with text parts", () => {
    const msg: Message = {
      role: "user",
      content: [
        { type: "text", text: "hello world" },
        { type: "image_url", image: { uri: "http://example.com/img.png" } }
      ]
    };
    const count = countMessageTokens(msg);
    // Should only count the text part
    expect(count).toBeGreaterThan(0);
  });

  it("counts tokens from tool calls", () => {
    const msg: Message = {
      role: "assistant",
      content: "",
      toolCalls: [{ id: "tc1", name: "search", args: { query: "hello world" } }]
    };
    expect(countMessageTokens(msg)).toBeGreaterThan(0);
  });

  it("handles tool calls with un-stringifiable args (circular reference)", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const msg: Message = {
      role: "assistant",
      content: "",
      toolCalls: [{ id: "tc1", name: "test_tool", args: circular as any }]
    };
    // Should not throw; should still count the name tokens
    const count = countMessageTokens(msg);
    expect(count).toBeGreaterThan(0);
    // The count should equal just the name tokens since args serialization fails
    const nameOnly = countTextTokens("test_tool");
    expect(count).toBe(nameOnly);
  });

  it("returns 0 for an empty message", () => {
    const msg: Message = { role: "assistant", content: "" };
    expect(countMessageTokens(msg)).toBe(0);
  });
});

describe("countMessagesTokens", () => {
  it("sums across multiple messages", () => {
    const msgs: Message[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "world" }
    ];
    const total = countMessagesTokens(msgs);
    const individual =
      countMessageTokens(msgs[0]) + countMessageTokens(msgs[1]);
    expect(total).toBe(individual);
  });

  it("returns 0 for empty array", () => {
    expect(countMessagesTokens([])).toBe(0);
  });
});
