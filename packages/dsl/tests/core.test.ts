import { describe, test, expect, beforeAll } from "vitest";
import {
  isOutputHandle,
  createNode,
  workflow,
  run,
  runGraph
} from "../src/core.js";
import type { OutputHandle, DslNode, SingleOutput } from "../src/core.js";
import { NodeRegistry, ALL_E2E_NODES, Constant } from "@nodetool/node-sdk";

beforeAll(() => {
  for (const NodeClass of ALL_E2E_NODES) {
    NodeRegistry.global.register(NodeClass);
  }
});

describe("isOutputHandle", () => {
  test("returns true for OutputHandle objects", () => {
    const handle = Object.freeze({
      __brand: "OutputHandle" as const,
      nodeId: "abc",
      slot: "value"
    });
    expect(isOutputHandle(handle)).toBe(true);
  });

  test("returns false for plain values", () => {
    expect(isOutputHandle(42)).toBe(false);
    expect(isOutputHandle("hello")).toBe(false);
    expect(isOutputHandle(null)).toBe(false);
    expect(isOutputHandle(undefined)).toBe(false);
    expect(isOutputHandle({ nodeId: "x" })).toBe(false);
    expect(isOutputHandle({ __brand: "Other" })).toBe(false);
  });
});

describe("createNode", () => {
  test("returns frozen object with unique nodeId", () => {
    const node = createNode<SingleOutput<number>>("nodetool.math.Add", {
      lhs: 1,
      rhs: 2
    });
    expect(node.nodeId).toBeDefined();
    expect(node.nodeType).toBe("nodetool.math.Add");
    expect(node.inputs).toEqual({ lhs: 1, rhs: 2 });
    expect(Object.isFrozen(node)).toBe(true);
    // clean up
    workflow(node);
  });

  test("output() returns OutputHandle for the default slot", () => {
    const node = createNode<SingleOutput<number>>("nodetool.math.Add", {
      lhs: 1,
      rhs: 2
    });
    const output = node.output();
    expect(isOutputHandle(output)).toBe(true);
    expect(output.nodeId).toBe(node.nodeId);
    expect(output.slot).toBe("output");
    workflow(node);
  });

  test("output() requires an explicit slot when there is no default output", () => {
    const node = createNode<{ r: number; g: number }>(
      "nodetool.image.ChannelSplit",
      { image: "test" },
      { outputNames: ["r", "g"] }
    );
    expect(() => node.output()).toThrow("requires an explicit output slot");
    workflow(node);
  });

  test("output(slot) returns OutputHandle with correct slot name", () => {
    const node = createNode<{ r: number; g: number }>(
      "nodetool.image.ChannelSplit",
      { image: "test" },
      { outputNames: ["r", "g"] }
    );
    const r = node.output("r");
    expect(isOutputHandle(r)).toBe(true);
    expect(r.slot).toBe("r");
    expect(r.nodeId).toBe(node.nodeId);
    workflow(node);
  });

  test("literal values pass through in inputs", () => {
    const node = createNode<SingleOutput<string>>("nodetool.constant.String", {
      a: "hello",
      b: 42,
      c: true,
      d: [1, 2, 3]
    });
    expect(node.inputs).toEqual({ a: "hello", b: 42, c: true, d: [1, 2, 3] });
    workflow(node);
  });

  test("two nodes get different nodeIds", () => {
    const a = createNode<SingleOutput<number>>("nodetool.math.Add", {});
    const b = createNode<SingleOutput<number>>("nodetool.math.Add", {});
    expect(a.nodeId).not.toBe(b.nodeId);
    workflow(a, b);
  });
});

describe("workflow", () => {
  test("single node — 1 node, 0 edges", () => {
    const a = createNode<SingleOutput<number>>("nodetool.constant.Integer", {
      input_item: 5
    });
    const wf = workflow(a);
    expect(wf.nodes).toHaveLength(1);
    expect(wf.edges).toHaveLength(0);
    expect(wf.nodes[0].type).toBe("nodetool.constant.Integer");
    expect(wf.nodes[0].data).toEqual({ input_item: 5 });
  });

  test("linear chain — 2 nodes, 1 edge", () => {
    const a = createNode<SingleOutput<number>>("nodetool.constant.Integer", {
      input_item: 5
    });
    const b = createNode<SingleOutput<number>>("nodetool.math.Add", {
      lhs: a.output(),
      rhs: 1
    });
    const wf = workflow(b);
    expect(wf.nodes).toHaveLength(2);
    expect(wf.edges).toHaveLength(1);
    expect(wf.edges[0]).toEqual(
      expect.objectContaining({
        sourceHandle: "output",
        targetHandle: "lhs"
      })
    );
    const bNode = wf.nodes.find((n) => n.type === "nodetool.math.Add")!;
    expect(bNode.data).toEqual({ rhs: 1 });
    expect(bNode.data).not.toHaveProperty("lhs");
  });

  test("diamond dependency — no duplicate nodes", () => {
    const a = createNode<SingleOutput<number>>("nodetool.constant.Integer", {
      input_item: 5
    });
    const b = createNode<SingleOutput<number>>("nodetool.math.Add", {
      lhs: a.output(),
      rhs: 1
    });
    const c = createNode<SingleOutput<number>>("nodetool.math.Multiply", {
      lhs: b.output(),
      rhs: a.output()
    });
    const wf = workflow(c);
    expect(wf.nodes).toHaveLength(3);
    expect(wf.edges).toHaveLength(3);
  });

  test("multiple terminals — all branches traced", () => {
    const a = createNode<SingleOutput<number>>("nodetool.constant.Integer", {
      value: 1
    });
    const b = createNode<SingleOutput<number>>("nodetool.math.Add", {
      lhs: a.output(),
      rhs: 2
    });
    const c = createNode<SingleOutput<number>>("nodetool.constant.Integer", {
      value: 10
    });
    const d = createNode<SingleOutput<number>>("nodetool.math.Add", {
      lhs: c.output(),
      rhs: 3
    });
    const wf = workflow(b, d);
    expect(wf.nodes).toHaveLength(4);
    expect(wf.edges).toHaveLength(2);
  });

  test("streaming flag preserved", () => {
    const a = createNode<SingleOutput<number>>(
      "nodetool.control.Collect",
      { input_item: 5 },
      { streaming: true }
    );
    const wf = workflow(a);
    expect(wf.nodes[0].streaming).toBe(true);
  });

  test("non-streaming defaults to false", () => {
    const a = createNode<SingleOutput<number>>("nodetool.math.Add", {
      lhs: 1,
      rhs: 2
    });
    const wf = workflow(a);
    expect(wf.nodes[0].streaming).toBe(false);
  });

  test("throws on zero arguments", () => {
    expect(() => workflow()).toThrow(
      "workflow() requires at least one terminal node"
    );
  });

  test("registry is cleared after workflow()", () => {
    const a = createNode<SingleOutput<number>>("nodetool.constant.Integer", {
      input_item: 5
    });
    workflow(a);
    const b = createNode<SingleOutput<number>>("nodetool.math.Add", {
      lhs: a.output(),
      rhs: 1
    });
    expect(() => workflow(b)).toThrow("Node not found");
  });

  test("result is frozen", () => {
    const a = createNode<SingleOutput<number>>("nodetool.constant.Integer", {
      input_item: 5
    });
    const wf = workflow(a);
    expect(Object.isFrozen(wf)).toBe(true);
  });

  test("topological order — sources before consumers", () => {
    const a = createNode<SingleOutput<number>>("nodetool.constant.Integer", {
      input_item: 5
    });
    const b = createNode<SingleOutput<number>>("nodetool.math.Add", {
      lhs: a.output(),
      rhs: 1
    });
    const c = createNode<SingleOutput<number>>("nodetool.math.Multiply", {
      lhs: b.output(),
      rhs: 2
    });
    const wf = workflow(c);
    const ids = wf.nodes.map((n) => n.id);
    expect(ids.indexOf(a.nodeId)).toBeLessThan(ids.indexOf(b.nodeId));
    expect(ids.indexOf(b.nodeId)).toBeLessThan(ids.indexOf(c.nodeId));
  });
});

describe("run / runGraph", () => {
  // Test node output slots (from their process() return values):
  //   nodetool.test.Constant  → { value: ... }
  //   nodetool.test.Add       → { result: ... }
  //   nodetool.test.ErrorNode → throws

  test("run() executes a single source node and returns its outputs", async () => {
    const a = createNode<SingleOutput<number, "value">>(
      "nodetool.test.Constant",
      { value: 42 },
      { outputNames: ["value"], defaultOutput: "value" }
    );
    const result = await run(workflow(a));
    // Constant is the only (terminal) node; result keyed by node id
    expect(result[a.nodeId]).toBe(42);
  });

  test("run() executes a Constant → Add chain and returns computed result", async () => {
    const a = createNode<SingleOutput<number, "value">>(
      "nodetool.test.Constant",
      { value: 3 },
      { outputNames: ["value"], defaultOutput: "value" }
    );
    const b = createNode<SingleOutput<number, "result">>(
      "nodetool.test.Add",
      { a: a.output(), b: 4 },
      { outputNames: ["result"], defaultOutput: "result" }
    );
    const result = await run(workflow(b));
    expect(result[b.nodeId]).toBe(7);
  });

  test("run() rejects when a node throws", async () => {
    const a = createNode<SingleOutput<never>>("nodetool.test.ErrorNode", {
      message: "boom"
    });
    await expect(run(workflow(a))).rejects.toThrow("boom");
  });

  test("run() uses an explicit registry when provided", async () => {
    const reg = new NodeRegistry();
    reg.register(Constant);
    const a = createNode<SingleOutput<number, "value">>(
      "nodetool.test.Constant",
      { value: 99 },
      { outputNames: ["value"], defaultOutput: "value" }
    );
    const result = await run(workflow(a), { registry: reg });
    expect(result[a.nodeId]).toBe(99);
  });

  test("runGraph() executes the workflow inline", async () => {
    const a = createNode<SingleOutput<number, "value">>(
      "nodetool.test.Constant",
      { value: 7 },
      { outputNames: ["value"], defaultOutput: "value" }
    );
    const result = await runGraph(a);
    expect(result[a.nodeId]).toBe(7);
  });

  test("diamond graph — single constant fans out to Add and Multiply", async () => {
    const c = createNode<SingleOutput<number, "value">>(
      "nodetool.test.Constant",
      { value: 10 },
      { outputNames: ["value"], defaultOutput: "value" }
    );
    const add = createNode<SingleOutput<number, "result">>(
      "nodetool.test.Add",
      { a: c.output(), b: 5 },
      { outputNames: ["result"], defaultOutput: "result" }
    );
    const mul = createNode<SingleOutput<number, "result">>(
      "nodetool.test.Multiply",
      { a: c.output(), b: 3 },
      { outputNames: ["result"], defaultOutput: "result" }
    );
    const result = await run(workflow(add, mul));
    expect(result[add.nodeId]).toBe(15);
    expect(result[mul.nodeId]).toBe(30);
  });

  test("long chain A → B → C — executes in dependency order", async () => {
    const a = createNode<SingleOutput<number, "value">>(
      "nodetool.test.Constant",
      { value: 2 },
      { outputNames: ["value"], defaultOutput: "value" }
    );
    const b = createNode<SingleOutput<number, "result">>(
      "nodetool.test.Add",
      { a: a.output(), b: 3 },
      { outputNames: ["result"], defaultOutput: "result" }
    );
    const c = createNode<SingleOutput<number, "result">>(
      "nodetool.test.Multiply",
      { a: b.output(), b: 4 },
      { outputNames: ["result"], defaultOutput: "result" }
    );
    const result = await run(workflow(c));
    expect(result[c.nodeId]).toBe(20); // (2 + 3) * 4
  });

  test("string template pipeline — FormatText fed from Constant", async () => {
    const text = createNode<SingleOutput<string, "value">>(
      "nodetool.test.Constant",
      { value: "world" },
      { outputNames: ["value"], defaultOutput: "value" }
    );
    const fmt = createNode<SingleOutput<string, "result">>(
      "nodetool.test.FormatText",
      { template: "Hello, {{ text }}!", text: text.output() },
      { outputNames: ["result"], defaultOutput: "result" }
    );
    const result = await run(workflow(fmt));
    expect(result[fmt.nodeId]).toBe("Hello, world!");
  });

  test("two independent parallel branches both produce results", async () => {
    const a = createNode<SingleOutput<number, "value">>(
      "nodetool.test.Constant",
      { value: 1 },
      { outputNames: ["value"], defaultOutput: "value" }
    );
    const b = createNode<SingleOutput<number, "result">>(
      "nodetool.test.Add",
      { a: a.output(), b: 9 },
      { outputNames: ["result"], defaultOutput: "result" }
    );
    const c = createNode<SingleOutput<number, "value">>(
      "nodetool.test.Constant",
      { value: 5 },
      { outputNames: ["value"], defaultOutput: "value" }
    );
    const d = createNode<SingleOutput<number, "result">>(
      "nodetool.test.Multiply",
      { a: c.output(), b: 6 },
      { outputNames: ["result"], defaultOutput: "result" }
    );
    const result = await run(workflow(b, d));
    expect(result[b.nodeId]).toBe(10);
    expect(result[d.nodeId]).toBe(30);
  });

  test("conditional node succeeds when shouldFail is false", async () => {
    const proc = createNode<SingleOutput<string, "result">>(
      "nodetool.test.ConditionalErrorProcessor",
      { shouldFail: false, message: "should not throw" },
      { outputNames: ["result"], defaultOutput: "result" }
    );
    const result = await run(workflow(proc));
    expect(result[proc.nodeId]).toBe("ok");
  });

  test("conditional node rejects when shouldFail is true", async () => {
    const proc = createNode<SingleOutput<string, "result">>(
      "nodetool.test.ConditionalErrorProcessor",
      { shouldFail: true, message: "conditional boom" },
      { outputNames: ["result"], defaultOutput: "result" }
    );
    await expect(run(workflow(proc))).rejects.toThrow("conditional boom");
  });

  test("runGraph() with a multi-node chain", async () => {
    const a = createNode<SingleOutput<number, "value">>(
      "nodetool.test.Constant",
      { value: 3 },
      { outputNames: ["value"], defaultOutput: "value" }
    );
    const b = createNode<SingleOutput<string, "result">>(
      "nodetool.test.StringConcat",
      { a: "x=", b: a.output() },
      { outputNames: ["result"], defaultOutput: "result" }
    );
    const result = await runGraph(b);
    expect(result[b.nodeId]).toBe("x=3");
  });
});
