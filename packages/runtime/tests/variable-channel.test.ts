import { describe, it, expect } from "vitest";
import { VariableChannel } from "../src/variable-channel.js";
import { ProcessingContext } from "../src/context.js";

describe("VariableChannel", () => {
  it("first() resolves immediately when a value already exists", async () => {
    const ch = new VariableChannel<string>();
    ch.send("a");
    ch.send("b");
    expect(await ch.first()).toBe("a");
  });

  it("first() waits for the first value then caches it", async () => {
    const ch = new VariableChannel<number>();
    const pending = ch.first();
    ch.send(42);
    expect(await pending).toBe(42);
    // Subsequent first() calls return the same cached value.
    expect(await ch.first()).toBe(42);
  });

  it("first() resolves undefined when the channel closes empty", async () => {
    const ch = new VariableChannel<string>();
    const pending = ch.first();
    ch.close();
    expect(await pending).toBeUndefined();
    expect(await ch.first()).toBeUndefined();
  });

  it("stream() replays buffered values then ends on close", async () => {
    const ch = new VariableChannel<number>();
    ch.send(1);
    ch.send(2);
    const collected: number[] = [];
    const done = (async () => {
      for await (const v of ch.stream()) {
        collected.push(v);
      }
    })();
    ch.send(3);
    ch.close();
    await done;
    expect(collected).toEqual([1, 2, 3]);
  });

  it("delivers the full history to a late subscriber", async () => {
    const ch = new VariableChannel<string>();
    ch.send("x");
    ch.send("y");
    ch.close();
    const collected: string[] = [];
    for await (const v of ch.stream()) {
      collected.push(v);
    }
    expect(collected).toEqual(["x", "y"]);
  });

  it("broadcasts to multiple independent subscribers", async () => {
    const ch = new VariableChannel<number>();
    const a: number[] = [];
    const b: number[] = [];
    const da = (async () => {
      for await (const v of ch.stream()) a.push(v);
    })();
    const db = (async () => {
      for await (const v of ch.stream()) b.push(v);
    })();
    ch.send(1);
    ch.send(2);
    ch.close();
    await Promise.all([da, db]);
    expect(a).toEqual([1, 2]);
    expect(b).toEqual([1, 2]);
  });

  it("ignores sends after close", () => {
    const ch = new VariableChannel<number>();
    ch.close();
    ch.send(1);
    expect(ch.hasValue).toBe(false);
    expect(ch.closed).toBe(true);
  });
});

describe("ProcessingContext channels", () => {
  const ctx = () => new ProcessingContext({ jobId: "channel-test" });

  it("closes a channel with no registered writers immediately", async () => {
    const c = ctx();
    const ch = c.getChannel("missing");
    expect(ch.closed).toBe(true);
    expect(await ch.first()).toBeUndefined();
  });

  it("keeps a channel open until its last writer is done", async () => {
    const c = ctx();
    c.registerChannelWriters("x", 2);
    const ch = c.getChannel<string>("x");
    expect(ch.closed).toBe(false);

    ch.send("hello");
    c.markChannelWriterDone("x");
    expect(ch.closed).toBe(false); // one writer left
    c.markChannelWriterDone("x");
    expect(ch.closed).toBe(true); // last writer done

    expect(await ch.first()).toBe("hello");
  });

  it("returns the same channel instance for a name", () => {
    const c = ctx();
    c.registerChannelWriters("y", 1);
    expect(c.getChannel("y")).toBe(c.getChannel("y"));
  });

  it("closeAllChannels releases waiting readers", async () => {
    const c = ctx();
    c.registerChannelWriters("z", 1);
    const ch = c.getChannel<string>("z");
    const pending = ch.first();
    c.closeAllChannels();
    expect(await pending).toBeUndefined();
  });
});
