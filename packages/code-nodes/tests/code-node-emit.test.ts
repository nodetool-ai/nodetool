import { describe, it, expect } from "vitest";
import { CodeNode, EMIT_CHANNEL_CAPACITY } from "@nodetool-ai/code-nodes";
import type { ProcessingContext } from "@nodetool-ai/runtime";

/** Drive genProcess to completion and collect every bag it yields. */
async function collect(
  code: string,
  inputs: Record<string, unknown> = {},
  context?: ProcessingContext
): Promise<Record<string, unknown>[]> {
  const node = new CodeNode({ code, ...inputs });
  const bags: Record<string, unknown>[] = [];
  for await (const bag of node.genProcess(context)) {
    bags.push(bag);
  }
  return bags;
}

/**
 * A ProcessingContext stub carrying only what the node reads on these paths:
 * the log/progress channel and the workflow id. Bodies here touch no
 * workspace, secret, or asset API, so nothing else is exercised.
 */
function stubContext(): {
  context: ProcessingContext;
  messages: Record<string, unknown>[];
} {
  const messages: Record<string, unknown>[] = [];
  const context = {
    workflowId: "wf-test",
    postMessage: (message: Record<string, unknown>) => {
      messages.push(message);
    }
  } as unknown as ProcessingContext;
  return { context, messages };
}

// ---------------------------------------------------------------------------
// emit — streaming
// ---------------------------------------------------------------------------

describe("CodeNode — emit contract streaming", () => {
  it("yields one bag per emit, in call order, and nothing else", async () => {
    const bags = await collect(
      `await emit("out", 1);
       await emit("out", 2);
       await emit("out", 3);`
    );
    expect(bags).toEqual([{ out: 1 }, { out: 2 }, { out: 3 }]);
  });

  it("keeps distinct handle names apart", async () => {
    const bags = await collect(
      `await emit("a", "x"); await emit("b", "y"); await emit("a", "z");`
    );
    expect(bags).toEqual([{ a: "x" }, { b: "y" }, { a: "z" }]);
  });

  it("emits from a loop over an input", async () => {
    const bags = await collect(
      `for (const word of inputs.text.split(" ")) await emit("word", word);`,
      { text: "one two three" }
    );
    expect(bags).toEqual([
      { word: "one" },
      { word: "two" },
      { word: "three" }
    ]);
  });
});

// ---------------------------------------------------------------------------
// output — finals
// ---------------------------------------------------------------------------

describe("CodeNode — emit + output", () => {
  it("posts the final bag last, after every emitted value", async () => {
    const bags = await collect(
      `let sum = 0;
       for (const n of [1, 2, 3]) { sum += n; await emit("item", n); }
       await output("sum", sum);`
    );
    expect(bags).toEqual([
      { item: 1 },
      { item: 2 },
      { item: 3 },
      { sum: 6 }
    ]);
  });

  it("delivers several finals as one bag", async () => {
    const bags = await collect(
      `await output("a", 1); await output("b", 2);`
    );
    expect(bags).toEqual([{ a: 1, b: 2 }]);
  });

  it("yields no final bag when output is never called", async () => {
    const bags = await collect(`await emit("out", 1);`);
    expect(bags).toEqual([{ out: 1 }]);
  });
});

// ---------------------------------------------------------------------------
// The return value carries no outputs
// ---------------------------------------------------------------------------

describe("CodeNode — return value ignored on the new contract", () => {
  it("never surfaces a returned object as a bag", async () => {
    const bags = await collect(
      `await emit("out", 1);
       return { bogus: 1 };`
    );
    expect(bags).toEqual([{ out: 1 }]);
    expect(bags.some((bag) => "bogus" in bag)).toBe(false);
  });

  it("treats return as control flow only", async () => {
    const bags = await collect(
      `await emit("out", 1);
       if (true) return { bogus: 2 };
       await emit("out", 2);`
    );
    expect(bags).toEqual([{ out: 1 }]);
  });

  it("ignores the return value in process() too", async () => {
    const node = new CodeNode({
      code: `await output("a", 1); return { bogus: 3 };`
    });
    expect(await node.process()).toEqual({ a: 1 });
  });
});

// ---------------------------------------------------------------------------
// process() — single-shot merge
// ---------------------------------------------------------------------------

describe("CodeNode — process() on the new contract", () => {
  it("keeps the last emitted value for a handle with no final", async () => {
    const node = new CodeNode({
      code: `await emit("out", 1); await emit("out", 2);`
    });
    expect(await node.process()).toEqual({ out: 2 });
  });

  it("lets the final value win over emitted ones", async () => {
    const node = new CodeNode({
      code: `await emit("out", 1); await output("out", 99);`
    });
    expect(await node.process()).toEqual({ out: 99 });
  });

  it("merges emitted-only and final-only handles", async () => {
    const node = new CodeNode({
      code: `await emit("item", "a"); await output("count", 1);`
    });
    expect(await node.process()).toEqual({ item: "a", count: 1 });
  });
});

// ---------------------------------------------------------------------------
// Legacy routing
// ---------------------------------------------------------------------------

describe("CodeNode — legacy bodies still run, and warn", () => {
  it("runs a return-bag body exactly as before", async () => {
    const bags = await collect("return { a: 1 }");
    expect(bags).toEqual([{ a: 1 }]);
  });

  it("still wraps an implicit return", async () => {
    const bags = await collect("{ sum: 3 + 4 }");
    expect(bags).toEqual([{ sum: 7 }]);
  });

  it("still replays yielded values", async () => {
    const bags = await collect("yield({ a: 1 }); yield({ b: 2 });");
    expect(bags).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("posts one deprecation warning for a legacy body", async () => {
    const { context, messages } = stubContext();
    const node = new CodeNode({ code: "return { a: 1 }", __node_id: "n1" });
    const bags: Record<string, unknown>[] = [];
    for await (const bag of node.genProcess(context)) bags.push(bag);

    expect(bags).toEqual([{ a: 1 }]);
    const warnings = messages.filter(
      (message) =>
        message.type === "log_update" && message.severity === "warning"
    );
    expect(warnings).toHaveLength(1);
    expect(String(warnings[0].content)).toMatch(/deprecated/i);
    expect(String(warnings[0].content)).toMatch(/emit\(name, value\)/);
    expect(String(warnings[0].content)).toMatch(/output\(name, value\)/);
  });

  it("posts no deprecation warning for an emit/output body", async () => {
    const { context, messages } = stubContext();
    const node = new CodeNode({
      code: `await output("a", 1);`,
      __node_id: "n1"
    });
    for await (const _bag of node.genProcess(context)) {
      // drain
    }
    const warnings = messages.filter(
      (message) =>
        message.type === "log_update" && message.severity === "warning"
    );
    expect(warnings).toEqual([]);
  });

  it("does not mistake the word emit inside a string for the contract", async () => {
    const bags = await collect('const s = "please emit(this)"; return { s }');
    expect(bags).toEqual([{ s: "please emit(this)" }]);
  });
});

// ---------------------------------------------------------------------------
// Failure after emits
// ---------------------------------------------------------------------------

describe("CodeNode — failure after emits", () => {
  it("keeps delivered bags, throws, and drops the finals", async () => {
    const node = new CodeNode({
      code: `await emit("out", 1);
             await emit("out", 2);
             await output("final", "dropped");
             throw new Error("boom");`
    });
    const bags: Record<string, unknown>[] = [];
    await expect(async () => {
      for await (const bag of node.genProcess()) bags.push(bag);
    }).rejects.toThrow("boom");

    expect(bags).toEqual([{ out: 1 }, { out: 2 }]);
    expect(bags.some((bag) => "final" in bag)).toBe(false);
  });

  it("throws on a timeout mid-stream, keeping what was delivered", async () => {
    const node = new CodeNode({
      code: `await emit("out", 1); await sleep(10000); await output("f", 1);`,
      timeout: 0.2
    });
    const bags: Record<string, unknown>[] = [];
    await expect(async () => {
      for await (const bag of node.genProcess()) bags.push(bag);
    }).rejects.toThrow();
    expect(bags.some((bag) => "f" in bag)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Backpressure
// ---------------------------------------------------------------------------

describe("CodeNode — backpressure", () => {
  it("delivers every bag in order past the channel bound to a slow consumer", async () => {
    const total = EMIT_CHANNEL_CAPACITY + 6;
    const node = new CodeNode({
      code: `for (let i = 0; i < ${total}; i++) await emit("n", i);`,
      timeout: 60
    });

    const seen: number[] = [];
    for await (const bag of node.genProcess()) {
      seen.push(bag.n as number);
      // Yield to the event loop between pulls: the producer runs ahead, fills
      // the channel, and can only continue as this loop drains it.
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    expect(seen).toHaveLength(total);
    expect(seen).toEqual(Array.from({ length: total }, (_, i) => i));
  });

  it("stops the producer at the bound (no bag is lost or reordered)", async () => {
    const total = EMIT_CHANNEL_CAPACITY * 2;
    const node = new CodeNode({
      code: `for (let i = 0; i < ${total}; i++) await emit("n", i);
             await output("done", ${total});`,
      timeout: 60
    });

    const seen: number[] = [];
    let done: unknown;
    for await (const bag of node.genProcess()) {
      if ("done" in bag) {
        done = bag.done;
        continue;
      }
      seen.push(bag.n as number);
    }

    expect(seen).toEqual(Array.from({ length: total }, (_, i) => i));
    expect(done).toBe(total);
  });
});

// ---------------------------------------------------------------------------
// Early generator termination
// ---------------------------------------------------------------------------

describe("CodeNode — early termination", () => {
  it("leaves nothing in flight when the consumer breaks mid-stream", async () => {
    const node = new CodeNode({
      code: `for (let i = 0; i < 500; i++) await emit("n", i);
             await output("done", true);`,
      timeout: 60
    });

    const seen: number[] = [];
    for await (const bag of node.genProcess()) {
      seen.push(bag.n as number);
      if (seen.length === 3) break;
    }

    expect(seen).toEqual([0, 1, 2]);
  });
});
