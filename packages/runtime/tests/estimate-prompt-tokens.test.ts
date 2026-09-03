import { describe, it, expect } from "vitest";
import type { Message, MessageContent } from "@nodetool-ai/protocol";
import { estimatePromptTokens } from "../src/providers/base-provider.js";
import { countTokens } from "../src/token-counter.js";

/** A `data:` uri whose base64 payload is about 200 KB, as `resolveMessageMediaUris` produces. */
function dataUriImage(bytes: number): string {
  return `data:image/png;base64,${"A".repeat(bytes)}`;
}

describe("estimatePromptTokens", () => {
  it("scores an inlined image by modality, not by base64 length", () => {
    const message: Message = {
      role: "user",
      content: [
        { type: "text", text: "What is in this screenshot?" },
        { type: "image_url", image: { uri: dataUriImage(200_000) } }
      ] as MessageContent[]
    } as Message;

    expect(estimatePromptTokens([message])).toBeLessThan(3000);
  });

  it("leaves a plain-text message unchanged", () => {
    const text = "Summarize the release notes for the last three versions.";
    const message = { role: "user", content: text } as Message;

    expect(estimatePromptTokens([message])).toBe(countTokens(text));
  });

  it("counts the text parts of a mixed message", () => {
    const text = "Compare these two frames and describe the difference.";
    const message: Message = {
      role: "user",
      content: [
        { type: "text", text },
        { type: "image_url", image: { uri: dataUriImage(50_000) } },
        { type: "image_url", image: { uri: dataUriImage(50_000) } }
      ] as MessageContent[]
    } as Message;

    const total = estimatePromptTokens([message]);
    expect(total).toBeGreaterThan(countTokens(text));
    expect(total).toBeLessThan(countTokens(text) + 4000);
  });

  it("still counts tool calls", () => {
    const message = {
      role: "assistant",
      content: null,
      toolCalls: [{ id: "1", name: "search", args: { query: "compaction" } }]
    } as unknown as Message;

    expect(estimatePromptTokens([message])).toBeGreaterThan(0);
  });
});
