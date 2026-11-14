import { describe, expect, it } from "vitest";
import { MAX_BUFFERED_RUN_MESSAGES, bufferRunMessage } from "../src/mcp-apps.js";

describe("bufferRunMessage", () => {
  it("drops stream chunks past the cap but keeps every other message", () => {
    const messages: Array<Record<string, unknown>> = [];
    for (let i = 0; i < MAX_BUFFERED_RUN_MESSAGES; i += 1) {
      expect(bufferRunMessage(messages, { type: "chunk", content: "x" })).toBe(true);
    }
    expect(bufferRunMessage(messages, { type: "chunk", content: "y" })).toBe(false);
    expect(messages).toHaveLength(MAX_BUFFERED_RUN_MESSAGES);

    expect(bufferRunMessage(messages, { type: "output_update", value: 1 })).toBe(true);
    expect(bufferRunMessage(messages, { type: "job_update", status: "completed" })).toBe(true);
    expect(messages.at(-1)).toEqual({ type: "job_update", status: "completed" });
  });
});
