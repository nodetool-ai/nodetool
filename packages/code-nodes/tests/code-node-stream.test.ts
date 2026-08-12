/**
 * The Code node's streaming-input mode: a body that calls `stream` runs once
 * and drains its own inbox, the way `run(inputs, outputs)` is called by the
 * kernel actor.
 *
 * Every case drives `run()` directly over a real `NodeInbox` wrapped in the
 * kernel's own `NodeInputs`/`NodeOutputs`, so what these tests exercise is the
 * bridge the actor uses, not a stand-in for it.
 */

import { describe, it, expect } from "vitest";
import { CodeNode } from "@nodetool-ai/code-nodes";
import { NodeInbox, NodeInputs, NodeOutputs } from "@nodetool-ai/kernel";

/** One routed value, in the order the node emitted it. */
interface Routed {
  slot: string;
  value: unknown;
  group?: true;
}

interface Harness {
  inbox: NodeInbox;
  inputs: NodeInputs;
  outputs: NodeOutputs;
  routed: Routed[];
  cancel: () => void;
}

function harness(handles: string[] = []): Harness {
  const inbox = new NodeInbox();
  for (const handle of handles) inbox.addUpstream(handle, 1);
  const controller = new AbortController();
  const inputs = new NodeInputs(inbox, null, undefined, controller.signal);
  const routed: Routed[] = [];
  const outputs = new NodeOutputs({
    sendFn: async (slot, value) => {
      routed.push({ slot, value });
    },
    emitGroupFn: async (values) => {
      for (const [slot, value] of Object.entries(values)) {
        routed.push({ slot, value, group: true });
      }
    }
  });
  return { inbox, inputs, outputs, routed, cancel: () => controller.abort() };
}

/** Feed a handle's items and close it. */
async function feed(
  inbox: NodeInbox,
  handle: string,
  items: readonly unknown[]
): Promise<void> {
  for (const item of items) await inbox.put(handle, item);
  inbox.markSourceDone(handle);
}

function node(code: string, props: Record<string, unknown> = {}): CodeNode {
  return new CodeNode({ code, ...props });
}

const TIMEOUT_MS = 30_000;

describe("CodeNode.run — per-handle delivery", () => {
  it(
    "reads a handle in order and posts the final bag after the body ends",
    async () => {
      const h = harness(["numbers"]);
      const run = node(
        `let sum = 0;
         for await (const n of stream("numbers")) {
           sum += n;
           await emit("running", sum);
         }
         await output("total", sum);`
      ).run!(h.inputs, h.outputs);

      await feed(h.inbox, "numbers", [1, 2, 3]);
      await run;

      expect(h.routed).toEqual([
        { slot: "running", value: 1 },
        { slot: "running", value: 3 },
        { slot: "running", value: 6 },
        { slot: "total", value: 6, group: true }
      ]);
    },
    TIMEOUT_MS
  );

  it(
    "emits live: values reach the consumer before end-of-stream",
    async () => {
      const h = harness(["items"]);
      const run = node(
        `for await (const item of stream("items")) {
           await emit("echo", item);
         }`
      ).run!(h.inputs, h.outputs);

      await h.inbox.put("items", "first");
      // No EOS yet, so the body is still parked on its next take — but the
      // first value must already be downstream.
      await waitFor(() => h.routed.length === 1);
      expect(h.routed).toEqual([{ slot: "echo", value: "first" }]);

      await feed(h.inbox, "items", ["second"]);
      await run;
      expect(h.routed.map((entry) => entry.value)).toEqual([
        "first",
        "second"
      ]);
    },
    TIMEOUT_MS
  );

  it(
    "posts every final in one bag",
    async () => {
      const h = harness(["a"]);
      const run = node(
        `for await (const _ of stream("a")) {}
         await output("x", 1);
         await output("y", 2);`
      ).run!(h.inputs, h.outputs);

      await feed(h.inbox, "a", ["go"]);
      await run;

      expect(h.routed).toEqual([
        { slot: "x", value: 1, group: true },
        { slot: "y", value: 2, group: true }
      ]);
    },
    TIMEOUT_MS
  );
});

describe("CodeNode.run — stream.any and stream.first", () => {
  it(
    "interleaves two handles in arrival order",
    async () => {
      const h = harness(["left", "right"]);
      const run = node(
        `for await (const [handle, value] of stream.any()) {
           await emit("merged", handle + ":" + value);
         }`
      ).run!(h.inputs, h.outputs);

      await h.inbox.put("left", "l1");
      await waitFor(() => h.routed.length === 1);
      await h.inbox.put("right", "r1");
      await waitFor(() => h.routed.length === 2);
      await h.inbox.put("left", "l2");
      h.inbox.markSourceDone("left");
      h.inbox.markSourceDone("right");
      await run;

      expect(h.routed.map((entry) => entry.value)).toEqual([
        "left:l1",
        "right:r1",
        "left:l2"
      ]);
    },
    TIMEOUT_MS
  );

  it(
    "gives stream.first one value and undefined after end-of-stream",
    async () => {
      const h = harness(["config"]);
      const run = node(
        `const first = await stream.first("config");
         const second = await stream.first("config");
         await output("first", first);
         await output("second", second === undefined ? "eos" : second);`
      ).run!(h.inputs, h.outputs);

      await feed(h.inbox, "config", [{ tone: "terse" }]);
      await run;

      expect(h.routed).toEqual([
        { slot: "first", value: { tone: "terse" }, group: true },
        { slot: "second", value: "eos", group: true }
      ]);
    },
    TIMEOUT_MS
  );

  it(
    "reports stream.open per handle",
    async () => {
      const h = harness(["a"]);
      const run = node(
        `const before = stream.open("a");
         for await (const _ of stream("a")) {}
         await output("before", before);
         await output("after", stream.open("a"));`
      ).run!(h.inputs, h.outputs);

      await feed(h.inbox, "a", [1]);
      await run;

      expect(h.routed).toEqual([
        { slot: "before", value: true, group: true },
        { slot: "after", value: false, group: true }
      ]);
    },
    TIMEOUT_MS
  );
});

describe("CodeNode.run — failure and cancellation", () => {
  it(
    "drops the finals when the body throws mid-stream, keeping prior emits",
    async () => {
      const h = harness(["numbers"]);
      const run = node(
        `for await (const n of stream("numbers")) {
           if (n === 2) throw new Error("boom");
           await emit("ok", n);
         }
         await output("total", "never");`
      ).run!(h.inputs, h.outputs);

      const settled = run.then(
        () => "resolved",
        (error: Error) => error.message
      );
      await feed(h.inbox, "numbers", [1, 2, 3]);

      expect(await settled).toContain("boom");
      expect(h.routed).toEqual([{ slot: "ok", value: 1 }]);
    },
    TIMEOUT_MS
  );

  it(
    "unwinds when the run is cancelled while parked on a take",
    async () => {
      const h = harness(["items"]);
      const run = node(
        `for await (const item of stream("items")) {
           await emit("echo", item);
         }
         await output("done", true);`
      ).run!(h.inputs, h.outputs);

      await h.inbox.put("items", "one");
      await waitFor(() => h.routed.length === 1);
      h.cancel();

      await expect(run).resolves.toBeUndefined();
      // The cancelled invocation posts no final bag.
      expect(h.routed).toEqual([{ slot: "echo", value: "one" }]);
    },
    TIMEOUT_MS
  );

  it(
    "fails clearly when a non-streaming body is routed here",
    async () => {
      const h = harness([]);
      await expect(
        node(`await output("x", 1);`).run!(h.inputs, h.outputs)
      ).rejects.toThrow(/never calls stream/);
    },
    TIMEOUT_MS
  );
});

describe("CodeNode.run — timeout metering", () => {
  it(
    "survives an input gap longer than the body's own timeout",
    async () => {
      const h = harness(["slow"]);
      const run = node(
        `for await (const n of stream("slow")) {
           await emit("out", n);
         }
         await output("done", true);`,
        { timeout: 1 }
      ).run!(h.inputs, h.outputs);

      // Two seconds parked on an empty, still-open inbox: double the body's
      // one-second budget, which the clock must not be charged for.
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await feed(h.inbox, "slow", [7]);
      await run;

      expect(h.routed).toEqual([
        { slot: "out", value: 7 },
        { slot: "done", value: true, group: true }
      ]);
    },
    TIMEOUT_MS
  );
});

describe("CodeNode.run — the inputs bag", () => {
  it(
    "carries the node's configured properties, never per-item edge data",
    async () => {
      const h = harness(["items"]);
      const run = node(
        `for await (const item of stream("items")) {
           await emit("seen", { item, prefix: inputs.prefix });
         }`,
        { prefix: "cfg" }
      ).run!(h.inputs, h.outputs);

      await feed(h.inbox, "items", ["a"]);
      await run;

      expect(h.routed).toEqual([
        { slot: "seen", value: { item: "a", prefix: "cfg" } }
      ]);
    },
    TIMEOUT_MS
  );
});

describe("CodeNode.resolveStreamingInput", () => {
  it("is true for a body that calls a stream verb", () => {
    for (const code of [
      `for await (const n of stream("a")) {}`,
      `for await (const [h, v] of stream.any()) {}`,
      `const v = await stream.first("a");`,
      `if (stream.open("a")) {}`
    ]) {
      expect(CodeNode.resolveStreamingInput({ properties: { code } })).toBe(
        true
      );
    }
  });

  it("is false for a buffered body, including a lookalike name", () => {
    for (const code of [
      `await output("x", inputs.a);`,
      `await mystream("a");`,
      `await thing.stream("a");`,
      `// stream("a")`,
      ""
    ]) {
      expect(CodeNode.resolveStreamingInput({ properties: { code } })).toBe(
        false
      );
    }
    expect(CodeNode.resolveStreamingInput({})).toBe(false);
  });
});

/** Spin until `predicate` holds, so a test never sleeps longer than it must. */
async function waitFor(
  predicate: () => boolean,
  timeoutMs = 10_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("condition never held");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
