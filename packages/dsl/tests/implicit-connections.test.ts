import { describe, expect, test } from "vitest";
import { createNode, workflow, resolveConnection, run } from "../src/core.js";
import { string } from "../src/generated/nodetool.constant.js";
import { concat, collect } from "../src/generated/nodetool.text.js";

function build(explicit: boolean) {
  const source = string({ value: "hello" }, { id: "source" });
  const left = concat(
    { a: explicit ? source.output() : source, b: "!" },
    { id: "left" }
  );
  const right = concat(
    { a: explicit ? source.output() : source, b: "?" },
    { id: "right" }
  );
  return workflow(left, right);
}

describe("implicit connections", () => {
  test("matches explicit handles, keeps literals, and visits a shared producer once", () => {
    const implicit = build(false);
    expect(implicit).toEqual(build(true));
    expect(implicit.nodes.map((node) => node.id)).toEqual([
      "source",
      "left",
      "right"
    ]);
    expect(implicit.edges).toHaveLength(2);
    expect(implicit.nodes.find((node) => node.id === "left")?.data).toEqual({
      b: "!"
    });
  });

  test("executes an implicitly wired graph through the existing kernel", async () => {
    const source = string({ value: "hello" });
    const joined = collect({ input_item: source });
    expect(await run(workflow(joined))).toEqual({ [joined.nodeId]: "hello" });
  });

  test("normalizes nodes and handles without treating literal objects as nodes", () => {
    const source = string({ value: "hello" });
    expect(resolveConnection(source)).toEqual(source.output());
    expect(resolveConnection(source.output())).toEqual(source.output());
    expect(resolveConnection({ nodeId: source.nodeId })).toBeUndefined();
    workflow(source);
  });

  test("requires output selection for multiple outputs even with an explicit default", () => {
    const source = createNode<{ a: string; b: string }, "a">(
      "custom.Split",
      {},
      {
        outputNames: ["a", "b"],
        defaultOutput: "a"
      }
    );
    expect(() => createNode("custom.Consumer", { value: source })).toThrow(
      "explicit output slot"
    );
    const sink = createNode("custom.Consumer", { value: source.output("b") });
    expect(workflow(sink).edges[0].sourceHandle).toBe("b");
  });

  test("rejects nested implicit nodes rather than persisting them as literals", () => {
    const source = string({ value: "hello" });
    const sink = createNode("custom.Consumer", { settings: { source } });
    expect(() => workflow(sink)).toThrow(/settings.source/);
    workflow(source);
  });

  test("refuses coercion of symbolic nodes", () => {
    const source = string({ value: "hello" });
    expect(() => String(source)).toThrow("Cannot coerce a DSL node");
    workflow(source);
  });

  test("keeps explicit identity, rejects duplicates, and allows reuse after a build", () => {
    const node = string({ value: "hello" }, { id: "greeting" });
    expect(() => string({ value: "other" }, { id: "greeting" })).toThrow(
      'Duplicate node id "greeting"'
    );
    expect(workflow(node).nodes[0].id).toBe("greeting");
    expect(workflow(string({}, { id: "greeting" })).nodes[0].id).toBe(
      "greeting"
    );
    expect(() => string({}, { id: "" })).toThrow("non-empty string");
  });

  test("does not resolve old nodes or handles to a reused explicit id", () => {
    const old = string({ value: "old" }, { id: "shared_id" });
    const handle = old.output();
    workflow(old);
    const replacement = string({ value: "new" }, { id: "shared_id" });
    const sink = concat({ a: handle });
    expect(() => workflow(sink)).toThrow("previous workflow() build");
    expect(() => workflow(old)).toThrow("previous workflow() build");
    const lateSink = concat({ a: old.output() });
    expect(() => workflow(lateSink)).toThrow("previous workflow() build");
    workflow(replacement);
  });

  test("preserves reachable producers on a large chain", () => {
    let node = string({ value: "hello" });
    for (let i = 0; i < 10000; i++) {
      node = concat({ a: node, b: "!" });
    }
    const graph = workflow(node);
    expect(graph.nodes).toHaveLength(10001);
    expect(graph.edges).toHaveLength(10000);
  });
});
