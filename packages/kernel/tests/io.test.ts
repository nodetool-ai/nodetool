/**
 * NodeInputs tests – parity with Python NodeInputs behavior.
 */

import { describe, it, expect } from "vitest";
import { NodeInbox } from "../src/inbox.js";
import { NodeInputs, NodeOutputs } from "../src/io.js";

// Helper: collect all items from an async generator
async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of gen) {
    items.push(item);
  }
  return items;
}

describe("NodeInputs – first", () => {
  it("returns the first item from a handle", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    await inbox.put("a", 10);
    await inbox.put("a", 20);
    inbox.markSourceDone("a");

    const inputs = new NodeInputs(inbox);
    const result = await inputs.first("a");
    expect(result).toBe(10);
  });

  it("returns default when inbox is empty and closed", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.markSourceDone("a");

    const inputs = new NodeInputs(inbox);
    const result = await inputs.first("a", "fallback");
    expect(result).toBe("fallback");
  });

  it("returns undefined when no default and no data", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.markSourceDone("a");

    const inputs = new NodeInputs(inbox);
    const result = await inputs.first("a");
    expect(result).toBeUndefined();
  });
});

describe("NodeInputs – firstWithEnvelope", () => {
  it("returns an envelope with data and metadata", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    await inbox.put("a", "hello", { key: "val" });
    inbox.markSourceDone("a");

    const inputs = new NodeInputs(inbox);
    const env = await inputs.firstWithEnvelope("a");
    expect(env).toBeDefined();
    expect((env as any).data).toBe("hello");
    expect((env as any).metadata).toEqual({ key: "val" });
  });

  it("returns default when empty and closed", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.markSourceDone("a");

    const inputs = new NodeInputs(inbox);
    const result = await inputs.firstWithEnvelope("a", "default");
    expect(result).toBe("default");
  });
});

describe("NodeInputs – stream", () => {
  it("yields all items until EOS", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    await inbox.put("a", 1);
    await inbox.put("a", 2);
    await inbox.put("a", 3);
    inbox.markSourceDone("a");

    const inputs = new NodeInputs(inbox);
    const items = await collect(inputs.stream("a"));
    expect(items).toEqual([1, 2, 3]);
  });

  it("yields nothing when immediately closed", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.markSourceDone("a");

    const inputs = new NodeInputs(inbox);
    const items = await collect(inputs.stream("a"));
    expect(items).toEqual([]);
  });
});

describe("NodeInputs – streamWithEnvelope", () => {
  it("yields envelopes with metadata", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    await inbox.put("a", "x", { m: 1 });
    inbox.markSourceDone("a");

    const inputs = new NodeInputs(inbox);
    const envs = await collect(inputs.streamWithEnvelope("a"));
    expect(envs).toHaveLength(1);
    expect(envs[0].data).toBe("x");
    expect(envs[0].metadata).toEqual({ m: 1 });
  });
});

describe("NodeInputs – any", () => {
  it("yields [handle, item] from multiple handles", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    inbox.addUpstream("b", 1);
    await inbox.put("a", "a1");
    await inbox.put("b", "b1");
    await inbox.put("a", "a2");
    inbox.markSourceDone("a");
    inbox.markSourceDone("b");

    const inputs = new NodeInputs(inbox);
    const items = await collect(inputs.any());
    expect(items).toEqual([
      ["a", "a1"],
      ["b", "b1"],
      ["a", "a2"]
    ]);
  });
});

describe("NodeInputs – anyWithEnvelope", () => {
  it("yields [handle, envelope] tuples", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("x", 1);
    await inbox.put("x", 42);
    inbox.markSourceDone("x");

    const inputs = new NodeInputs(inbox);
    const items = await collect(inputs.anyWithEnvelope());
    expect(items).toHaveLength(1);
    expect(items[0][0]).toBe("x");
    expect(items[0][1].data).toBe(42);
  });
});

describe("NodeInputs – hasBuffered and hasStream", () => {
  it("hasBuffered returns true when data is buffered", async () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);
    await inbox.put("a", 1);

    const inputs = new NodeInputs(inbox);
    expect(inputs.hasBuffered("a")).toBe(true);
    expect(inputs.hasBuffered("b")).toBe(false);
  });

  it("hasStream returns true when upstream is open", () => {
    const inbox = new NodeInbox();
    inbox.addUpstream("a", 1);

    const inputs = new NodeInputs(inbox);
    expect(inputs.hasStream("a")).toBe(true);

    inbox.markSourceDone("a");
    expect(inputs.hasStream("a")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// NodeOutputs tests
// ---------------------------------------------------------------------------

describe("NodeOutputs – emit and collected", () => {
  it("collects emitted values per slot", async () => {
    const outputs = new NodeOutputs();
    await outputs.emit("result", 42);
    await outputs.emit("label", "hello");
    expect(outputs.collected()).toEqual({ result: 42, label: "hello" });
  });

  it("last emit wins per slot", async () => {
    const outputs = new NodeOutputs();
    await outputs.emit("x", 1);
    await outputs.emit("x", 2);
    expect(outputs.collected()).toEqual({ x: 2 });
  });

  it("empty slot name defaults to 'output'", async () => {
    const outputs = new NodeOutputs();
    await outputs.emit("", "val");
    expect(outputs.collected()).toEqual({ output: "val" });
  });

  it("default() emits to 'output' slot", async () => {
    const outputs = new NodeOutputs();
    await outputs.default("abc");
    expect(outputs.collected()).toEqual({ output: "abc" });
  });
});

describe("NodeOutputs – sendFn callback", () => {
  it("calls sendFn with slot and value", async () => {
    const calls: Array<[string, unknown]> = [];
    const outputs = new NodeOutputs({
      sendFn: async (slot, value) => {
        calls.push([slot, value]);
      }
    });
    await outputs.emit("out", 99);
    await outputs.emit("other", "x");
    expect(calls).toEqual([
      ["out", 99],
      ["other", "x"]
    ]);
  });

  it("does not call sendFn when not provided", async () => {
    const outputs = new NodeOutputs();
    await outputs.emit("x", 1); // no throw
    expect(outputs.collected()).toEqual({ x: 1 });
  });
});

describe("NodeOutputs – complete and eosCallback", () => {
  it("calls eosCallback with slot name", () => {
    const slots: string[] = [];
    const outputs = new NodeOutputs({ eosCallback: (s) => slots.push(s) });
    outputs.complete("stream_out");
    outputs.complete("other");
    expect(slots).toEqual(["stream_out", "other"]);
  });

  it("does not throw when eosCallback not provided", () => {
    const outputs = new NodeOutputs();
    expect(() => outputs.complete("x")).not.toThrow();
  });
});

describe("NodeOutputs – collected returns snapshot", () => {
  it("snapshot is a copy, not the internal state", async () => {
    const outputs = new NodeOutputs();
    await outputs.emit("a", 1);
    const snap = outputs.collected();
    await outputs.emit("b", 2);
    expect(snap).toEqual({ a: 1 }); // unchanged
    expect(outputs.collected()).toEqual({ a: 1, b: 2 });
  });
});
