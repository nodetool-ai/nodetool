/**
 * Channel & ChannelManager tests – parity with Python channel.py behavior.
 */

import { describe, it, expect } from "vitest";
import { Channel, ChannelManager, type ChannelStats } from "../src/channel.js";

// Helper: collect all items from an async generator
async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of gen) {
    items.push(item);
  }
  return items;
}

// ---------------------------------------------------------------------------
// Channel
// ---------------------------------------------------------------------------

describe("Channel – basic publish/subscribe", () => {
  it("single subscriber receives all published messages", async () => {
    const ch = new Channel<string>("test");

    // Start subscriber before publishing
    const collected = collect(ch.subscribe("sub1"));

    await ch.publish("hello");
    await ch.publish("world");
    await ch.close();

    expect(await collected).toEqual(["hello", "world"]);
  });

  it("multiple subscribers each get all messages", async () => {
    const ch = new Channel<number>("multi");

    const sub1 = collect(ch.subscribe("s1"));
    const sub2 = collect(ch.subscribe("s2"));

    await ch.publish(1);
    await ch.publish(2);
    await ch.publish(3);
    await ch.close();

    expect(await sub1).toEqual([1, 2, 3]);
    expect(await sub2).toEqual([1, 2, 3]);
  });

  it("channel close terminates all subscriber generators", async () => {
    const ch = new Channel("close-test");

    const sub1 = collect(ch.subscribe("s1"));
    const sub2 = collect(ch.subscribe("s2"));

    await ch.publish("before-close");
    await ch.close();

    const r1 = await sub1;
    const r2 = await sub2;
    expect(r1).toEqual(["before-close"]);
    expect(r2).toEqual(["before-close"]);
  });

  it("publish on closed channel throws", async () => {
    const ch = new Channel("closed");
    await ch.close();

    await expect(ch.publish("fail")).rejects.toThrow(
      "Channel closed is closed"
    );
  });

  it("subscribe on closed channel returns empty", async () => {
    const ch = new Channel("closed2");
    await ch.close();

    const items = await collect(ch.subscribe("s1"));
    expect(items).toEqual([]);
  });
});

describe("Channel – getStats", () => {
  it("reports correct stats", async () => {
    const ch = new Channel<string>("stats-ch");

    // Start a subscriber so it registers
    const subGen = ch.subscribe("s1");
    // Need to start the generator to register the subscriber
    const subPromise = collect(subGen);

    // Let the generator start
    await new Promise((r) => setTimeout(r, 10));

    const stats = ch.getStats();
    expect(stats.name).toBe("stats-ch");
    expect(stats.subscriberCount).toBe(1);
    expect(stats.isClosed).toBe(false);

    await ch.close();
    await subPromise;

    const statsAfter = ch.getStats();
    expect(statsAfter.isClosed).toBe(true);
  });

  it("reports messageType when provided", () => {
    class MyMsg {
      constructor(public text: string) {}
    }
    const ch = new Channel<MyMsg>("typed", 100, MyMsg);
    const stats = ch.getStats();
    expect(stats.messageType).toBe(MyMsg);
  });
});

describe("Channel – messageType getter", () => {
  it("returns the configured constructor, or undefined when untyped", () => {
    class MyMsg {}
    const typed = new Channel<MyMsg>("t", 100, MyMsg);
    const untyped = new Channel("u");
    expect(typed.messageType).toBe(MyMsg);
    expect(untyped.messageType).toBeUndefined();
  });
});

describe("Channel – subscriber cleanup", () => {
  it("removes the subscriber once its generator completes", async () => {
    const ch = new Channel<number>("cleanup");
    const done = collect(ch.subscribe("s1"));
    await new Promise((r) => setTimeout(r, 5));
    expect(ch.getStats().subscriberCount).toBe(1);

    await ch.publish(1);
    await ch.close();
    await done;

    expect(ch.getStats().subscriberCount).toBe(0);
  });
});

describe("Channel – type checking", () => {
  it("rejects messages of wrong type when messageType is set", async () => {
    class Msg {
      constructor(public val: number) {}
    }
    const ch = new Channel<Msg>("typed", 100, Msg);

    await expect(ch.publish("not a Msg" as unknown as Msg)).rejects.toThrow(
      TypeError
    );
  });

  it("type mismatch error names the channel and the expected type", async () => {
    class Msg {
      constructor(public val: number) {}
    }
    const ch = new Channel<Msg>("typed-msg", 100, Msg);
    await expect(
      ch.publish("nope" as unknown as Msg)
    ).rejects.toThrow(/Channel 'typed-msg' expects messages of type Msg/);
  });

  it("accepts messages of correct type", async () => {
    class Msg {
      constructor(public val: number) {}
    }
    const ch = new Channel<Msg>("typed-ok", 100, Msg);

    const sub = collect(ch.subscribe("s1"));
    await ch.publish(new Msg(42));
    await ch.close();

    const items = await sub;
    expect(items).toHaveLength(1);
    expect(items[0].val).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// ChannelManager
// ---------------------------------------------------------------------------

describe("ChannelManager – createChannel / getChannel", () => {
  it("creates and retrieves a channel", async () => {
    const mgr = new ChannelManager();
    const ch = await mgr.createChannel("test");

    expect(mgr.getChannel("test")).toBe(ch);
  });

  it("throws when creating duplicate channel without replace", async () => {
    const mgr = new ChannelManager();
    await mgr.createChannel("dup");

    await expect(mgr.createChannel("dup")).rejects.toThrow(
      "Channel 'dup' already exists"
    );
  });

  it("replaces channel when replace=true", async () => {
    const mgr = new ChannelManager();
    const ch1 = await mgr.createChannel("rep");
    const ch2 = await mgr.createChannel("rep", 100, true);

    expect(ch1.isClosed).toBe(true); // old channel closed
    expect(mgr.getChannel("rep")).toBe(ch2);
  });
});

describe("ChannelManager – getOrCreateChannel", () => {
  it("creates if not exists", async () => {
    const mgr = new ChannelManager();
    const ch = await mgr.getOrCreateChannel("new-ch");
    expect(ch).toBeDefined();
    expect(mgr.getChannel("new-ch")).toBe(ch);
  });

  it("returns existing channel", async () => {
    const mgr = new ChannelManager();
    const ch1 = await mgr.getOrCreateChannel("existing");
    const ch2 = await mgr.getOrCreateChannel("existing");
    expect(ch1).toBe(ch2);
  });

  it("throws on type mismatch", async () => {
    class TypeA {
      a = 1;
    }
    class TypeB {
      b = 2;
    }
    const mgr = new ChannelManager();
    await mgr.getOrCreateChannel("typed", 100, TypeA);

    await expect(mgr.getOrCreateChannel("typed", 100, TypeB)).rejects.toThrow(
      TypeError
    );
  });

  it("type mismatch error names the channel and both types", async () => {
    class TypeA {
      a = 1;
    }
    class TypeB {
      b = 2;
    }
    const mgr = new ChannelManager();
    await mgr.getOrCreateChannel("tch", 100, TypeA);
    await expect(
      mgr.getOrCreateChannel("tch", 100, TypeB)
    ).rejects.toThrow(/Channel 'tch' has type TypeA, but TypeB was requested/);
  });

  it("re-requesting an existing channel with the SAME type does not throw", async () => {
    class TypeA {
      a = 1;
    }
    const mgr = new ChannelManager();
    const c1 = await mgr.getOrCreateChannel("same", 100, TypeA);
    const c2 = await mgr.getOrCreateChannel("same", 100, TypeA);
    expect(c1).toBe(c2);
  });

  it("adding a type to a previously untyped channel does not throw", async () => {
    class TypeA {
      a = 1;
    }
    const mgr = new ChannelManager();
    const c1 = await mgr.getOrCreateChannel("untyped-first");
    const c2 = await mgr.getOrCreateChannel("untyped-first", 100, TypeA);
    expect(c1).toBe(c2);
  });

  it("requesting an existing typed channel without a type does not throw", async () => {
    class TypeA {
      a = 1;
    }
    const mgr = new ChannelManager();
    const c1 = await mgr.getOrCreateChannel("typed-first", 100, TypeA);
    const c2 = await mgr.getOrCreateChannel("typed-first");
    expect(c1).toBe(c2);
  });
});

describe("ChannelManager – publish convenience", () => {
  it("publish auto-creates channel and delivers messages", async () => {
    const mgr = new ChannelManager();

    // Subscribe first (auto-creates)
    const subGen = mgr.subscribe("auto", "s1");
    const items: unknown[] = [];

    // Start consuming
    const consumePromise = (async () => {
      for await (const item of subGen) {
        items.push(item);
      }
    })();

    // Let subscriber register
    await new Promise((r) => setTimeout(r, 10));

    await mgr.publish("auto", "msg1");
    await mgr.publish("auto", "msg2");
    await mgr.closeChannel("auto");

    await consumePromise;
    expect(items).toEqual(["msg1", "msg2"]);
  });
});

describe("ChannelManager – closeAll", () => {
  it("closes all channels", async () => {
    const mgr = new ChannelManager();
    await mgr.createChannel("a");
    await mgr.createChannel("b");
    await mgr.createChannel("c");

    await mgr.closeAll();

    expect(mgr.listChannels()).toEqual([]);
    expect(mgr.getChannel("a")).toBeUndefined();
  });
});

describe("ChannelManager – listChannels", () => {
  it("lists all channel names", async () => {
    const mgr = new ChannelManager();
    await mgr.createChannel("alpha");
    await mgr.createChannel("beta");

    const names = mgr.listChannels();
    expect(names).toContain("alpha");
    expect(names).toContain("beta");
    expect(names).toHaveLength(2);
  });
});

describe("ChannelManager – getAllStats", () => {
  it("returns stats for all channels", async () => {
    const mgr = new ChannelManager();
    await mgr.createChannel("s1");
    await mgr.createChannel("s2");

    const stats = mgr.getAllStats();
    expect(stats).toHaveLength(2);

    const names = stats.map((s: ChannelStats) => s.name);
    expect(names).toContain("s1");
    expect(names).toContain("s2");
  });
});

describe("ChannelManager – closeChannel", () => {
  it("closes and removes a specific channel", async () => {
    const mgr = new ChannelManager();
    await mgr.createChannel("keep");
    await mgr.createChannel("remove");

    await mgr.closeChannel("remove");

    expect(mgr.getChannel("remove")).toBeUndefined();
    expect(mgr.getChannel("keep")).toBeDefined();
    expect(mgr.listChannels()).toEqual(["keep"]);
  });

  it("closing non-existent channel is a no-op", async () => {
    const mgr = new ChannelManager();
    await mgr.closeChannel("nope"); // should not throw
  });
});

describe("ChannelManager – getChannelType", () => {
  it("returns registered type", async () => {
    class Evt {
      type = "event";
    }
    const mgr = new ChannelManager();
    await mgr.createChannel("events", 100, false, Evt);

    expect(mgr.getChannelType("events")).toBe(Evt);
  });

  it("returns undefined for untyped channel", async () => {
    const mgr = new ChannelManager();
    await mgr.createChannel("plain");

    expect(mgr.getChannelType("plain")).toBeUndefined();
  });

  it("replacing a typed channel with an untyped one clears the type", async () => {
    class Evt {
      type = "event";
    }
    const mgr = new ChannelManager();
    await mgr.createChannel("evt", 100, false, Evt);
    expect(mgr.getChannelType("evt")).toBe(Evt);

    await mgr.createChannel("evt", 100, true); // replace, no type
    expect(mgr.getChannelType("evt")).toBeUndefined();
  });
});

describe("ChannelManager – typed publish/subscribe", () => {
  it("publishTyped + subscribeTyped delivers correctly typed messages", async () => {
    class Msg {
      constructor(public val: number) {}
    }
    const mgr = new ChannelManager();
    const received: Msg[] = [];
    const consume = (async () => {
      for await (const m of mgr.subscribeTyped<Msg>("tps", "s1", Msg)) {
        received.push(m);
      }
    })();
    await new Promise((r) => setTimeout(r, 5));

    await mgr.publishTyped("tps", new Msg(7), Msg);
    await mgr.closeChannel("tps");
    await consume;

    expect(received).toHaveLength(1);
    expect(received[0].val).toBe(7);
  });
});

describe("ChannelManager – closeAll closes channels", () => {
  it("closes every channel before clearing them", async () => {
    const mgr = new ChannelManager();
    const a = await mgr.createChannel("a");
    const b = await mgr.createChannel("b");

    await mgr.closeAll();

    expect(a.isClosed).toBe(true);
    expect(b.isClosed).toBe(true);
    expect(mgr.listChannels()).toEqual([]);
  });
});
