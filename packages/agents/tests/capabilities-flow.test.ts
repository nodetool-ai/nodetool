/**
 * The `flow` capability module — the host bridge sandboxed guest code invokes
 * registry nodes through.
 *
 * Two backends are exercised. The real one (`@nodetool-ai/dsl/flow`, imported
 * from source so the suite needs no build) proves the wiring runs a real node
 * and reports a real registry error. A recording fake proves everything the
 * bridge itself owns — the depth gate, the stream table, the cap, the busy
 * check, and that an early close runs the node's own cleanup — without paying
 * for six node packs per case.
 */

import { afterEach, describe, expect, it } from "vitest";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { sandboxCapabilitySpecifier } from "@nodetool-ai/protocol";

import { UNGATED, createCapabilityRun } from "../src/capabilities/index.js";
import {
  capabilityModuleSpecs,
  createCapabilityDispatcher
} from "../src/capabilities/dispatcher.js";
import type { CapabilityRun } from "../src/capabilities/types.js";
import {
  FLOW_CAPABILITIES,
  FLOW_INVOKE_CHAIN_KEY,
  FLOW_INVOKE_DEPTH_KEY,
  MAX_FLOW_INVOKE_DEPTH,
  MAX_OPEN_NODE_STREAMS,
  setFlowBackend
} from "../src/capabilities/flow.js";
import { createChatCodeActSession } from "../src/codeact/chat-codeact.js";

const FLOW_SPECIFIER = sandboxCapabilitySpecifier("flow");

function context(): ProcessingContext {
  return new ProcessingContext({
    jobId: "job-flow-test",
    workflowId: null,
    userId: "1"
  });
}

/** A run serving only this module, so no other namespace has to load. */
function run(ctx: ProcessingContext = context()): CapabilityRun {
  return createCapabilityRun({
    context: ctx,
    gate: UNGATED,
    capabilities: FLOW_CAPABILITIES
  });
}

// ---------------------------------------------------------------------------
// The recording fake
// ---------------------------------------------------------------------------

interface FakeCall {
  type: string;
  inputs: Record<string, unknown>;
  depth: number | undefined;
  chain: string[] | undefined;
  context: ProcessingContext;
}

interface Fake {
  calls: FakeCall[];
  closedFlows: number;
  /** Set by a stream body's `finally`, so an early close is observable. */
  cleanedUp: string[];
  /** Resolves the next item a blocking stream yields. */
  release?: () => void;
}

/**
 * A backend in the shape `@nodetool-ai/dsl/flow` exports. `type` decides what
 * it does, so one fake covers every case:
 *   "boom"     — throws the registry's own unknown-type error
 *   "blocked"  — a stream that parks until `fake.release()` is called
 *   anything else — echoes its inputs, and streams three records
 */
function fakeBackend(fake: Fake) {
  return {
    createFlowForContext: async (ctx: ProcessingContext) => ({
      close: async () => {
        fake.closedFlows += 1;
      },
      context: ctx
    }),
    invoke: async (
      type: string,
      inputs: Record<string, unknown>,
      opts?: { flow?: { context?: ProcessingContext } }
    ) => {
      const ctx = opts?.flow?.context as ProcessingContext;
      fake.calls.push({
        type,
        inputs,
        depth: ctx.get<number>(FLOW_INVOKE_DEPTH_KEY),
        chain: ctx.get<string[]>(FLOW_INVOKE_CHAIN_KEY),
        context: ctx
      });
      if (type === "boom") throw new Error(`Unknown node type: ${type}`);
      return { echo: inputs };
    },
    invokeStream: async function* (
      type: string,
      inputs: Record<string, unknown>,
      opts?: { flow?: { context?: ProcessingContext } }
    ) {
      const ctx = opts?.flow?.context as ProcessingContext;
      fake.calls.push({
        type,
        inputs,
        depth: ctx.get<number>(FLOW_INVOKE_DEPTH_KEY),
        chain: ctx.get<string[]>(FLOW_INVOKE_CHAIN_KEY),
        context: ctx
      });
      try {
        if (type === "blocked") {
          yield { chunk: 0 };
          await new Promise<void>((resolve) => {
            fake.release = resolve;
          });
          yield { chunk: 1 };
          return;
        }
        for (let index = 0; index < 3; index += 1) {
          yield { chunk: index };
        }
      } finally {
        fake.cleanedUp.push(type);
      }
    }
  };
}

function pinFake(): Fake {
  const fake: Fake = { calls: [], closedFlows: 0, cleanedUp: [] };
  // SAFETY: the fake implements the structural contract `setFlowBackend`
  // takes; it is not the real module, which is the point.
  setFlowBackend(fakeBackend(fake) as never);
  return fake;
}

afterEach(() => {
  setFlowBackend(null);
});

// ---------------------------------------------------------------------------

describe("invoke_node against the real DSL flow backend", () => {
  it("runs a builtin node and returns its outputs", async () => {
    // Imported from source, not by package specifier: `@nodetool-ai/dsl/flow`
    // resolves only from a built workspace, and this suite must not need one.
    const backend = await import("../../dsl/src/flow/index.js");
    setFlowBackend(backend as never);

    const outputs = await run().invoke("invoke_node", {
      type: "nodetool.text.Concat",
      inputs: { a: "hi ", b: "there" }
    });

    expect(outputs).toEqual({ output: "hi there" });
  }, 180_000);

  it("surfaces an unknown node type as the registry's own error", async () => {
    const backend = await import("../../dsl/src/flow/index.js");
    setFlowBackend(backend as never);

    await expect(
      run().invoke("invoke_node", { type: "nodetool.text.NoSuchNode" })
    ).rejects.toThrow(/Unknown node type: nodetool\.text\.NoSuchNode/);
  }, 180_000);
});

describe("invoke_node", () => {
  it("runs the node on a child of the invoking run's context", async () => {
    const fake = pinFake();
    const ctx = context();
    const outputs = await run(ctx).invoke("invoke_node", {
      type: "test.Echo",
      inputs: { a: 1 }
    });

    expect(outputs).toEqual({ echo: { a: 1 } });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0].depth).toBe(1);
    expect(fake.calls[0].chain).toEqual(["test.Echo"]);
    expect(fake.calls[0].context.userId).toBe(ctx.userId);
    expect(fake.calls[0].context.jobId).toBe(ctx.jobId);
    // The flow is closed whether or not the call succeeded.
    expect(fake.closedFlows).toBe(1);
  });

  it("closes the flow when the node throws", async () => {
    const fake = pinFake();
    await expect(
      run().invoke("invoke_node", { type: "boom" })
    ).rejects.toThrow(/Unknown node type: boom/);
    expect(fake.closedFlows).toBe(1);
  });

  it("requires a node type", async () => {
    pinFake();
    await expect(run().invoke("invoke_node", {})).rejects.toThrow(
      /type is required/
    );
  });

  it("narrows the node's secret reach to the names the call lists", async () => {
    const fake = pinFake();
    const ctx = context();
    ctx.setSecretResolver((key: string) => `value-of-${key}`);

    await run(ctx).invoke("invoke_node", {
      type: "test.Echo",
      secrets: ["ALLOWED"]
    });

    const child = fake.calls[0].context;
    await expect(child.getSecret("ALLOWED")).resolves.toBe("value-of-ALLOWED");
    await expect(child.getSecret("OTHER")).resolves.toBeNull();
    // The invoking run keeps its own reach.
    await expect(ctx.getSecret("OTHER")).resolves.toBe("value-of-OTHER");
  });

  it("leaves the run's reach unchanged when no list is given", async () => {
    const fake = pinFake();
    const ctx = context();
    ctx.setSecretResolver((key: string) => `value-of-${key}`);

    await run(ctx).invoke("invoke_node", { type: "test.Echo" });

    await expect(fake.calls[0].context.getSecret("ANY")).resolves.toBe(
      "value-of-ANY"
    );
  });
});

describe("the depth gate", () => {
  it("refuses one level past the cap", async () => {
    const fake = pinFake();
    const ctx = context();
    ctx.set(FLOW_INVOKE_DEPTH_KEY, MAX_FLOW_INVOKE_DEPTH);
    ctx.set(FLOW_INVOKE_CHAIN_KEY, ["a", "b", "c", "d"]);

    const refusal = (await run(ctx).invoke("invoke_node", {
      type: "test.Echo"
    })) as Record<string, unknown>;

    expect(refusal["error"]).toBe("max_flow_invoke_depth_reached");
    expect(refusal["max_depth"]).toBe(MAX_FLOW_INVOKE_DEPTH);
    expect(fake.calls).toHaveLength(0);
  });

  it("refuses nothing at or below the cap", async () => {
    const fake = pinFake();
    for (let depth = 0; depth < MAX_FLOW_INVOKE_DEPTH; depth += 1) {
      const ctx = context();
      ctx.set(FLOW_INVOKE_DEPTH_KEY, depth);
      const outputs = await run(ctx).invoke("invoke_node", {
        type: "test.Echo",
        inputs: { depth }
      });
      expect(outputs).toEqual({ echo: { depth } });
    }
    expect(fake.calls.map((call) => call.depth)).toEqual([1, 2, 3, 4]);
  });

  it("gates open_node_stream the same way", async () => {
    const fake = pinFake();
    const ctx = context();
    ctx.set(FLOW_INVOKE_DEPTH_KEY, MAX_FLOW_INVOKE_DEPTH);

    const refusal = (await run(ctx).invoke("open_node_stream", {
      type: "test.Stream"
    })) as Record<string, unknown>;

    expect(refusal["error"]).toBe("max_flow_invoke_depth_reached");
    expect(fake.calls).toHaveLength(0);
  });
});

describe("node streams", () => {
  it("takes every item, then reports done", async () => {
    const fake = pinFake();
    const capabilityRun = run();
    const opened = (await capabilityRun.invoke("open_node_stream", {
      type: "test.Stream",
      inputs: { n: 3 }
    })) as { stream_id: string };
    expect(typeof opened.stream_id).toBe("string");

    const taken: unknown[] = [];
    for (;;) {
      const next = (await capabilityRun.invoke("take_node_stream", {
        stream_id: opened.stream_id
      })) as { done: boolean; value?: unknown };
      if (next.done) break;
      taken.push(next.value);
    }

    expect(taken).toEqual([{ chunk: 0 }, { chunk: 1 }, { chunk: 2 }]);
    expect(fake.cleanedUp).toEqual(["test.Stream"]);
    expect(fake.closedFlows).toBe(1);

    // A drained stream is closed: taking again is an error, not a hang.
    const after = (await capabilityRun.invoke("take_node_stream", {
      stream_id: opened.stream_id
    })) as Record<string, unknown>;
    expect(after["error"]).toBe("unknown_node_stream");
  });

  it("runs the node's cleanup on an early close", async () => {
    const fake = pinFake();
    const capabilityRun = run();
    const opened = (await capabilityRun.invoke("open_node_stream", {
      type: "test.Stream"
    })) as { stream_id: string };
    await capabilityRun.invoke("take_node_stream", {
      stream_id: opened.stream_id
    });
    expect(fake.cleanedUp).toEqual([]);

    const closed = await capabilityRun.invoke("close_node_stream", {
      stream_id: opened.stream_id
    });

    expect(closed).toEqual({ closed: true, was_open: true });
    expect(fake.cleanedUp).toEqual(["test.Stream"]);
    expect(fake.closedFlows).toBe(1);
  });

  it("closing an unknown stream is not an error", async () => {
    pinFake();
    expect(
      await run().invoke("close_node_stream", { stream_id: "nope" })
    ).toEqual({ closed: true, was_open: false });
  });

  it("caps how many streams one run holds open", async () => {
    pinFake();
    const capabilityRun = run();
    const ids: string[] = [];
    for (let index = 0; index < MAX_OPEN_NODE_STREAMS; index += 1) {
      const opened = (await capabilityRun.invoke("open_node_stream", {
        type: "test.Stream"
      })) as { stream_id: string };
      ids.push(opened.stream_id);
    }

    const refusal = (await capabilityRun.invoke("open_node_stream", {
      type: "test.Stream"
    })) as Record<string, unknown>;
    expect(refusal["error"]).toBe("too_many_open_node_streams");
    expect(refusal["max_open"]).toBe(MAX_OPEN_NODE_STREAMS);

    // Closing one makes room again.
    await capabilityRun.invoke("close_node_stream", { stream_id: ids[0] });
    const reopened = (await capabilityRun.invoke("open_node_stream", {
      type: "test.Stream"
    })) as { stream_id: string };
    expect(typeof reopened.stream_id).toBe("string");
  });

  it("counts streams per run, not per process", async () => {
    pinFake();
    const first = run();
    const second = run();
    const opened = (await first.invoke("open_node_stream", {
      type: "test.Stream"
    })) as { stream_id: string };

    // The other run cannot reach it, and holds none of its own.
    const stolen = (await second.invoke("take_node_stream", {
      stream_id: opened.stream_id
    })) as Record<string, unknown>;
    expect(stolen["error"]).toBe("unknown_node_stream");
  });

  it("refuses a second take while one is in flight", async () => {
    const fake = pinFake();
    const capabilityRun = run();
    const opened = (await capabilityRun.invoke("open_node_stream", {
      type: "blocked"
    })) as { stream_id: string };
    await capabilityRun.invoke("take_node_stream", {
      stream_id: opened.stream_id
    });

    const parked = capabilityRun.invoke("take_node_stream", {
      stream_id: opened.stream_id
    });
    const busy = (await capabilityRun.invoke("take_node_stream", {
      stream_id: opened.stream_id
    })) as Record<string, unknown>;
    expect(busy["error"]).toBe("node_stream_busy");

    fake.release?.();
    expect(await parked).toEqual({ done: false, value: { chunk: 1 } });
    await capabilityRun.invoke("close_node_stream", {
      stream_id: opened.stream_id
    });
  });
});

describe("the guest surface", () => {
  it("exports exactly the four wire names the pack calls", async () => {
    const [spec] = await capabilityModuleSpecs(["flow"]);
    expect(spec.specifier).toBe(FLOW_SPECIFIER);
    expect(spec.exports).toEqual([
      "invoke_node",
      "open_node_stream",
      "take_node_stream",
      "close_node_stream"
    ]);
  });

  it("dispatches a guest call through the module specifier", async () => {
    const fake = pinFake();
    const dispatcher = createCapabilityDispatcher(run(), ["flow"]);

    const outputs = await dispatcher.call(FLOW_SPECIFIER, "invoke_node", [
      { type: "test.Echo", inputs: { a: 1 } }
    ]);

    expect(outputs).toEqual({ echo: { a: 1 } });
    expect(fake.calls[0].type).toBe("test.Echo");
  });

  it("turns a refusal into a thrown error for the guest", async () => {
    pinFake();
    const ctx = context();
    ctx.set(FLOW_INVOKE_DEPTH_KEY, MAX_FLOW_INVOKE_DEPTH);
    const dispatcher = createCapabilityDispatcher(run(ctx), ["flow"]);

    await expect(
      dispatcher.call(FLOW_SPECIFIER, "invoke_node", [{ type: "test.Echo" }])
    ).rejects.toThrow(/node invocation depth limit of 4 is reached/);
  });

  it("runs from real guest code importing the module", async () => {
    const fake = pinFake();
    const capabilityRun = run();
    const session = createChatCodeActSession({
      tools: [],
      executeTool: async (call) => capabilityRun.invoke(call.name, call.args),
      capabilityRun
    });

    const observation = JSON.parse(
      await session.executeAction({
        code: `
          import { invoke_node } from "${FLOW_SPECIFIER}";
          const out = await invoke_node({
            type: "test.Echo",
            inputs: { a: 1, b: 2 }
          });
          return out.echo;
        `
      })
    ) as { ok: boolean; result?: unknown; error?: string };

    expect(observation.ok).toBe(true);
    expect(observation.result).toEqual({ a: 1, b: 2 });
    expect(fake.calls[0].type).toBe("test.Echo");
  }, 60_000);
});
