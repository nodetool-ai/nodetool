import { describe, test, expect, beforeAll } from "vitest";
import { workflow, isOutputHandle } from "../src/core.js";

let constant: any;
let control: any;

beforeAll(async () => {
  constant = await import("../src/generated/nodetool.constant.js");
  control = await import("../src/generated/nodetool.control.js");
});

describe("integration: multi-node workflows", () => {
  test("pipeline: 3 nodes, 2 edges", () => {
    const a = constant.integer({ value: 5 });
    const b = constant.integer({ value: 1 });
    const c = control.collect({ input_item: a.output() });
    const d = control.collect({ input_item: b.output() });
    const wf = workflow(c, d);
    expect(wf.nodes).toHaveLength(4);
    expect(wf.edges).toHaveLength(2);
  });

  test("diamond dependency — shared node deduplicated", () => {
    const shared = constant.float({ value: 3.14 });
    const left = control.collect({ input_item: shared.output() });
    const right = control.reroute({ input: shared.output() });
    const wf = workflow(left, right);
    expect(wf.nodes).toHaveLength(3);
    expect(wf.edges).toHaveLength(2);
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
    const b = control.collect({ input_item: a.output() });
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
    const node = control.if_({ condition: x.output(), value: y.output() });
    const wf = workflow(node);
    expect(wf.edges).toHaveLength(2);
    const condEdge = wf.edges.find((e: any) => e.targetHandle === "condition")!;
    expect(condEdge.source).toBe(x.nodeId);
    expect(condEdge.sourceHandle).toBe("output");
    expect(condEdge.target).toBe(node.nodeId);
  });

  test("topological order: sources before consumers", () => {
    const a = constant.integer({ value: 1 });
    const b = control.reroute({ input: a.output() });
    const c = control.collect({ input_item: b.output() });
    const wf = workflow(c);
    const ids = wf.nodes.map((n: any) => n.id);
    expect(ids.indexOf(a.nodeId)).toBeLessThan(ids.indexOf(b.nodeId));
    expect(ids.indexOf(b.nodeId)).toBeLessThan(ids.indexOf(c.nodeId));
  });

  test("multi-output node requires an explicit slot", () => {
    const node = control.if_({ condition: true, value: "test" });
    expect(() => node.output()).toThrow("requires an explicit output slot");
    expect(isOutputHandle(node.output("if_true"))).toBe(true);
    expect(isOutputHandle(node.output("if_false"))).toBe(true);
    workflow(node);
  });

  test("multi-output slot used as input creates correct edge", () => {
    const cond = constant.bool({ value: true });
    const ifNode = control.if_({ condition: cond.output(), value: "hello" });
    const collector = control.collect({ input_item: ifNode.output("if_true") });
    const wf = workflow(collector);
    expect(wf.nodes).toHaveLength(3);
    const ifTrueEdge = wf.edges.find((e: any) => e.sourceHandle === "if_true")!;
    expect(ifTrueEdge).toBeDefined();
    expect(ifTrueEdge.source).toBe(ifNode.nodeId);
    expect(ifTrueEdge.target).toBe(collector.nodeId);
    expect(ifTrueEdge.targetHandle).toBe("input_item");
  });
});
