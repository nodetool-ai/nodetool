import { describe, it, expect } from "vitest";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import { createUiEventBuffer } from "../src/utils/ui-event-buffer.js";

function chunk(content: string): ProcessingMessage {
  return { type: "chunk", content, done: false } satisfies ProcessingMessage;
}

describe("createUiEventBuffer", () => {
  it("drains in push order and empties the queue", () => {
    const ui = createUiEventBuffer();
    ui.push(chunk("a"), chunk("b"));
    ui.push(chunk("c"));
    expect([...ui.drain()]).toEqual([chunk("a"), chunk("b"), chunk("c")]);
    expect([...ui.drain()]).toEqual([]);
  });

  it("drains nothing when nothing was pushed", () => {
    expect([...createUiEventBuffer().drain()]).toEqual([]);
  });

  // The executors push from a tool's execute closure while the generator is
  // mid-drain; an event pushed then must still come out of that same drain.
  it("yields an event pushed while draining", () => {
    const ui = createUiEventBuffer();
    ui.push(chunk("a"));
    const seen: ProcessingMessage[] = [];
    for (const event of ui.drain()) {
      seen.push(event);
      if (seen.length === 1) ui.push(chunk("b"));
    }
    expect(seen).toEqual([chunk("a"), chunk("b")]);
  });
});
