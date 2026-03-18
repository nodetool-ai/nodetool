import { describe, test, expect } from "vitest";
import {
  isOutputHandle,
  createNode,
  workflow,
  run,
  runGraph,
} from "../src/core.js";
import type {
  OutputHandle,
  DslNode,
  SingleOutput,
} from "../src/core.js";

describe("isOutputHandle", () => {
  test("returns true for OutputHandle objects", () => {
    const handle = Object.freeze({
      __brand: "OutputHandle" as const,
      nodeId: "abc",
      slot: "output",
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
    const node = createNode<SingleOutput<number>>("nodetool.math.Add", { lhs: 1, rhs: 2 });
    expect(node.nodeId).toBeDefined();
    expect(node.nodeType).toBe("nodetool.math.Add");
    expect(node.inputs).toEqual({ lhs: 1, rhs: 2 });
    expect(Object.isFrozen(node)).toBe(true);
    // clean up
    workflow(node);
  });

  test(".output returns OutputHandle with slot 'output'", () => {
    const node = createNode<SingleOutput<number>>("nodetool.math.Add", { lhs: 1, rhs: 2 });
    expect(isOutputHandle(node.output)).toBe(true);
    expect(node.output.nodeId).toBe(node.nodeId);
    expect(node.output.slot).toBe("output");
    workflow(node);
  });

  test(".output is undefined for multi-output nodes", () => {
    const node = createNode<{ r: OutputHandle<number>; g: OutputHandle<number> }>(
      "nodetool.image.ChannelSplit",
      { image: "test" },
      { multiOutput: true }
    );
    expect(node.output).toBeUndefined();
    workflow(node);
  });

  test(".out.x returns OutputHandle with correct slot name", () => {
    const node = createNode<{ r: OutputHandle<number>; g: OutputHandle<number> }>(
      "nodetool.image.ChannelSplit",
      { image: "test" },
      { multiOutput: true }
    );
    const r = node.out.r;
    expect(isOutputHandle(r)).toBe(true);
    expect(r.slot).toBe("r");
    expect(r.nodeId).toBe(node.nodeId);
    workflow(node);
  });

  test("literal values pass through in inputs", () => {
    const node = createNode<SingleOutput<string>>("nodetool.text.Concat", {
      a: "hello",
      b: 42,
      c: true,
      d: [1, 2, 3],
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
    const a = createNode<SingleOutput<number>>("nodetool.constant.Integer", { value: 5 });
    const wf = workflow(a);
    expect(wf.nodes).toHaveLength(1);
    expect(wf.edges).toHaveLength(0);
    expect(wf.nodes[0].type).toBe("nodetool.constant.Integer");
    expect(wf.nodes[0].data).toEqual({ value: 5 });
  });

  test("linear chain — 2 nodes, 1 edge", () => {
    const a = createNode<SingleOutput<number>>("nodetool.constant.Integer", { value: 5 });
    const b = createNode<SingleOutput<number>>("nodetool.math.Add", {
      lhs: a.output,
      rhs: 1,
    });
    const wf = workflow(b);
    expect(wf.nodes).toHaveLength(2);
    expect(wf.edges).toHaveLength(1);
    expect(wf.edges[0]).toEqual(
      expect.objectContaining({
        sourceHandle: "output",
        targetHandle: "lhs",
      })
    );
    const bNode = wf.nodes.find((n) => n.type === "nodetool.math.Add")!;
    expect(bNode.data).toEqual({ rhs: 1 });
    expect(bNode.data).not.toHaveProperty("lhs");
  });

  test("diamond dependency — no duplicate nodes", () => {
    const a = createNode<SingleOutput<number>>("nodetool.constant.Integer", { value: 5 });
    const b = createNode<SingleOutput<number>>("nodetool.math.Add", {
      lhs: a.output,
      rhs: 1,
    });
    const c = createNode<SingleOutput<number>>("nodetool.math.Multiply", {
      lhs: b.output,
      rhs: a.output,
    });
    const wf = workflow(c);
    expect(wf.nodes).toHaveLength(3);
    expect(wf.edges).toHaveLength(3);
  });

  test("multiple terminals — all branches traced", () => {
    const a = createNode<SingleOutput<number>>("nodetool.constant.Integer", { value: 1 });
    const b = createNode<SingleOutput<number>>("nodetool.math.Add", { lhs: a.output, rhs: 2 });
    const c = createNode<SingleOutput<number>>("nodetool.constant.Integer", { value: 10 });
    const d = createNode<SingleOutput<number>>("nodetool.math.Add", { lhs: c.output, rhs: 3 });
    const wf = workflow(b, d);
    expect(wf.nodes).toHaveLength(4);
    expect(wf.edges).toHaveLength(2);
  });

  test("streaming flag preserved", () => {
    const a = createNode<SingleOutput<number>>(
      "nodetool.numbers.FilterNumber",
      { value: 5 },
      { streaming: true }
    );
    const wf = workflow(a);
    expect(wf.nodes[0].streaming).toBe(true);
  });

  test("non-streaming defaults to false", () => {
    const a = createNode<SingleOutput<number>>("nodetool.math.Add", { lhs: 1, rhs: 2 });
    const wf = workflow(a);
    expect(wf.nodes[0].streaming).toBe(false);
  });

  test("throws on zero arguments", () => {
    expect(() => workflow()).toThrow("workflow() requires at least one terminal node");
  });

  test("registry is cleared after workflow()", () => {
    const a = createNode<SingleOutput<number>>("nodetool.constant.Integer", { value: 5 });
    workflow(a);
    const b = createNode<SingleOutput<number>>("nodetool.math.Add", {
      lhs: a.output,
      rhs: 1,
    });
    expect(() => workflow(b)).toThrow("Node not found");
  });

  test("result is frozen", () => {
    const a = createNode<SingleOutput<number>>("nodetool.constant.Integer", { value: 5 });
    const wf = workflow(a);
    expect(Object.isFrozen(wf)).toBe(true);
  });

  test("topological order — sources before consumers", () => {
    const a = createNode<SingleOutput<number>>("nodetool.constant.Integer", { value: 5 });
    const b = createNode<SingleOutput<number>>("nodetool.math.Add", { lhs: a.output, rhs: 1 });
    const c = createNode<SingleOutput<number>>("nodetool.math.Multiply", { lhs: b.output, rhs: 2 });
    const wf = workflow(c);
    const ids = wf.nodes.map((n) => n.id);
    expect(ids.indexOf(a.nodeId)).toBeLessThan(ids.indexOf(b.nodeId));
    expect(ids.indexOf(b.nodeId)).toBeLessThan(ids.indexOf(c.nodeId));
  });
});

describe("run / runGraph stubs", () => {
  test("run() throws not-implemented error", async () => {
    const a = createNode<SingleOutput<number>>("nodetool.constant.Integer", { value: 1 });
    const wf = workflow(a);
    await expect(run(wf)).rejects.toThrow("run() is not yet implemented");
  });

  test("runGraph() propagates the not-implemented error", async () => {
    const a = createNode<SingleOutput<number>>("nodetool.constant.Integer", { value: 1 });
    await expect(runGraph(a)).rejects.toThrow("run() is not yet implemented");
  });
});
