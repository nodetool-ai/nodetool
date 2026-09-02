import { describe, it, expect } from "vitest";
import {
  isChunk,
  isProviderStop,
  isToolCall,
  type ProviderStreamItem
} from "../src/providers/types.js";

const chunk: ProviderStreamItem = {
  type: "chunk",
  content: "hello",
  done: false
};
const toolCall: ProviderStreamItem = { id: "tc_1", name: "search", args: {} };
const stop: ProviderStreamItem = { type: "stop", reason: "aborted" };
const message: ProviderStreamItem = {
  type: "message",
  message: { role: "assistant", content: "hi" }
};

describe("provider stream narrowers", () => {
  it("isChunk accepts only a chunk carrying string content", () => {
    expect(isChunk(chunk)).toBe(true);
    expect(isChunk(toolCall)).toBe(false);
    expect(isChunk(stop)).toBe(false);
    expect(isChunk(message)).toBe(false);
    // A chunk whose content is not a string is not usable as text.
    expect(
      isChunk({ type: "chunk", content: 7 } as unknown as ProviderStreamItem)
    ).toBe(false);
  });

  it("isToolCall accepts only the id+name shape", () => {
    expect(isToolCall(toolCall)).toBe(true);
    expect(isToolCall(chunk)).toBe(false);
    expect(isToolCall(stop)).toBe(false);
    expect(isToolCall(message)).toBe(false);
    // `name` without an `id` is not a tool call.
    expect(
      isToolCall({ name: "search" } as unknown as ProviderStreamItem)
    ).toBe(false);
  });

  it("the three narrowers partition the union", () => {
    for (const item of [chunk, toolCall, stop, message]) {
      const matches = [isChunk(item), isToolCall(item), isProviderStop(item)];
      expect(matches.filter(Boolean).length).toBeLessThanOrEqual(1);
    }
  });
});
