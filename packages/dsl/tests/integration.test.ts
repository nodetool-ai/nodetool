import { describe, test, expect, beforeAll } from "vitest";
import { workflow, isOutputHandle } from "../src/core.js";

let math: any;
let constant: any;
let control: any;

beforeAll(async () => {
  math = await import("../src/generated/lib.math.js");
  constant = await import("../src/generated/nodetool.constant.js");
  control = await import("../src/generated/nodetool.control.js");
});

describe("integration: multi-node workflows", () => {
  test("math pipeline: 3 nodes, 3 edges", () => {
    const a = constant.integer({ value: 5 });
    const b = math.add({ a: a.output, b: 1 });
    const c = math.multiply({ a: b.output, b: a.output });
    const wf = workflow(c);
    expect(wf.nodes).toHaveLength(3);
    expect(wf.edges).toHaveLength(3);
    expect(wf.edges).toContainEqual(
      expect.objectContaining({ sourceHandle: "output", targetHandle: "a" })
    );
  });

  test("diamond dependency — shared node deduplicated", () => {
    const shared = constant.float({ value: 3.14 });
    const left = math.add({ a: shared.output, b: 1 });
    const right = math.multiply({ a: shared.output, b: 2 });
    const final_ = math.add({ a: left.output, b: right.output });
    const wf = workflow(final_);
    expect(wf.nodes).toHaveLength(4);
    expect(wf.edges).toHaveLength(4);
    const sharedNodes = wf.nodes.filter((n: any) => n.id === shared.nodeId);
    expect(sharedNodes).toHaveLength(1);
  });

  test("multiple terminals trace all branches", () => {
    const a = constant.integer({ value: 1 });
    const b = constant.integer({ value: 2 });
    const wf = workflow(a, b);
    expect(wf.nodes).toHaveLength(2);
    expect(wf.edges).toHaveLength(0);
  });

  test("serializes to valid JSON", () => {
    const a = constant.integer({ value: 42 });
    const b = math.add({ a: a.output, b: 8 });
    const wf = workflow(b);
    const json = JSON.stringify(wf);
    const parsed = JSON.parse(json);
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.edges).toHaveLength(1);
    expect(parsed.nodes[0]).toHaveProperty("id");
    expect(parsed.nodes[0]).toHaveProperty("type");
    expect(parsed.nodes[0]).toHaveProperty("data");
    expect(parsed.nodes[0]).toHaveProperty("streaming");
  });

  test("edges match expected connections", () => {
    const x = constant.float({ value: 2.0 });
    const y = constant.float({ value: 3.0 });
    const sum = math.add({ a: x.output, b: y.output });
    const wf = workflow(sum);
    expect(wf.edges).toHaveLength(2);
    const aEdge = wf.edges.find((e: any) => e.targetHandle === "a")!;
    expect(aEdge.source).toBe(x.nodeId);
    expect(aEdge.sourceHandle).toBe("output");
    expect(aEdge.target).toBe(sum.nodeId);
    const bEdge = wf.edges.find((e: any) => e.targetHandle === "b")!;
    expect(bEdge.source).toBe(y.nodeId);
  });

  test("topological order: sources before consumers", () => {
    const a = constant.integer({ value: 1 });
    const b = math.add({ a: a.output, b: 2 });
    const c = math.multiply({ a: b.output, b: 3 });
    const wf = workflow(c);
    const ids = wf.nodes.map((n: any) => n.id);
    expect(ids.indexOf(a.nodeId)).toBeLessThan(ids.indexOf(b.nodeId));
    expect(ids.indexOf(b.nodeId)).toBeLessThan(ids.indexOf(c.nodeId));
  });

  test("multi-output node .output is undefined", () => {
    const node = control.if_({ condition: true, value: "test" });
    expect(node.output).toBeUndefined();
    expect(isOutputHandle(node.out.if_true)).toBe(true);
    expect(isOutputHandle(node.out.if_false)).toBe(true);
    workflow(node);
  });

  test("multi-output slot used as input creates correct edge", () => {
    const cond = constant.bool({ value: true });
    const ifNode = control.if_({ condition: cond.output, value: "hello" });
    const collector = control.collect({ input_item: ifNode.out.if_true });
    const wf = workflow(collector);
    expect(wf.nodes).toHaveLength(3);
    const ifTrueEdge = wf.edges.find((e: any) => e.sourceHandle === "if_true")!;
    expect(ifTrueEdge).toBeDefined();
    expect(ifTrueEdge.source).toBe(ifNode.nodeId);
    expect(ifTrueEdge.target).toBe(collector.nodeId);
    expect(ifTrueEdge.targetHandle).toBe("input_item");
  });
});
