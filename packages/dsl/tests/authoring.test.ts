import { describe, expect, test } from "vitest";
import { createNode, run } from "../src/core.js";
import { workflow, choose, map, t, template } from "../src/authoring.js";
import { string } from "../src/generated/nodetool.constant.js";
import { template as templateNode } from "../src/generated/nodetool.text.js";

function code<T>(body: string, inputs: Record<string, unknown>) {
  return createNode<{ output: T }, "output">(
    "nodetool.code.Code",
    { code: body, ...inputs },
    {
      outputNames: ["output"],
      defaultOutput: "output",
      outputTypes: { output: "str" }
    }
  );
}

describe("typed workflow authoring", () => {
  test("executes named inputs and outputs", async () => {
    const graph = workflow({ name: t.string() }, ({ name }) => ({
      greeting: template`Hello ${name}!`
    }));
    expect(await run(graph, { params: { name: "Ada" } })).toEqual({
      greeting: "Hello Ada!"
    });
    expect(JSON.parse(JSON.stringify(graph))).toEqual({
      nodes: graph.nodes,
      edges: graph.edges
    });
  });
  test("preserves optional defaults including null", async () => {
    const graph = workflow(
      { value: t.string().optional(), other: t.int().optional(7) },
      ({ value, other }) => ({ value, other })
    );
    expect(await run(graph)).toEqual({ value: null, other: 7 });
    expect(await run(graph, { params: { value: "set", other: 3 } })).toEqual({
      value: "set",
      other: 3
    });
  });
  test("composes reusable definitions with scoped explicit node ids", async () => {
    const reusable = workflow({ value: t.string() }, ({ value }) => ({
      result: templateNode({ string: "{{value}}!", value }, { id: "join" })
    }));
    const graph = workflow({}, () => ({
      a: reusable({ value: "one" }, { id: "left" }).result,
      b: reusable({ value: "two" }, { id: "right" }).result
    }));
    expect(graph.nodes.map((node) => node.id)).toContain("left/join");
    expect(graph.nodes.map((node) => node.id)).toContain("right/join");
    expect(await run(graph)).toEqual({ a: "one!", b: "two!" });
    expect(() => reusable({} as never)).toThrow("Missing required");
  });
  test("definition compilation preserves an active legacy graph", () => {
    const source = string({ value: "outer" }, { id: "outer" });
    workflow({}, () => ({ value: "inner" }));
    expect(workflow(source).nodes.map((node) => node.id)).toEqual(["outer"]);
  });
  test("named handles retain output methods and reserved slots", () => {
    const node = createNode<{ value: string; output: number; then: boolean }>(
      "test.Multi",
      {},
      { outputNames: ["value", "output", "then"] }
    );
    expect(node.value).toEqual(node.output("value"));
    expect(node.outputs.output).toEqual(node.output("output"));
    expect(node.outputs.then).toEqual(node.output("then"));
    expect(typeof node.output).toBe("function");
    expect("then" in node).toBe(false);
    workflow(node);
  });
  test.each([true, false])(
    "executes only the selected branch (%s) and forwards captures",
    async (condition) => {
      const graph = workflow(
        { condition: t.boolean(), name: t.string() },
        ({ condition, name }) => ({
          value: choose(condition, {
            then: () =>
              code<string>('await output("output", inputs.name + " yes");', {
                name
              }),
            else: () =>
              code<string>('await output("output", inputs.name + " no");', {
                name
              })
          })
        })
      );
      expect(await run(graph, { params: { condition, name: "Ada" } })).toEqual({
        value: `Ada ${condition ? "yes" : "no"}`
      });
    }
  );
  test("untaken throwing branch does not execute", async () => {
    const graph = workflow({}, () => ({
      value: choose(true, {
        then: () => "selected",
        else: () =>
          code<string>('throw new Error("untaken branch executed");', {})
      })
    }));
    expect(await run(graph)).toEqual({ value: "selected" });
  });
  test.each([{ items: [] }, { items: ["a"] }, { items: ["a", "b", "c"] }])(
    "maps items and index with captures: %j",
    async ({ items }) => {
      const graph = workflow(
        { items: t.list(t.string()), suffix: t.string() },
        ({ items, suffix }) => ({
          values: map(
            items,
            (item, index) => template`${index}:${item}${suffix}`
          )
        })
      );
      expect(await run(graph, { params: { items, suffix: "!" } })).toEqual({
        values: items.map((item, index) => `${index}:${item}!`)
      });
    }
  );
  test("nested maps and choices keep their own item scopes", async () => {
    const graph = workflow(
      { rows: t.list(t.list(t.string())), yes: t.boolean() },
      ({ rows, yes }) => ({
        values: map(rows, (row, outer) =>
          map(row, (item, inner) =>
            choose(yes, {
              then: () => template`${outer}:${inner}:${item}`,
              else: () => "no"
            })
          )
        )
      })
    );
    expect(
      await run(graph, { params: { rows: [["a", "b"], [], ["c"]], yes: true } })
    ).toEqual({ values: [["0:0:a", "0:1:b"], [], ["2:0:c"]] });
  });

  test("the selected branch surfaces errors", async () => {
    const graph = workflow({}, () => ({
      value: choose(false, {
        then: () => "safe",
        else: () => code<string>('throw new Error("selected failure");', {})
      })
    }));
    await expect(run(graph)).rejects.toThrow("selected failure");
  });

  test("preserves media parameters and reports missing required inputs", async () => {
    const graph = workflow({ image: t.image() }, ({ image }) => ({ image }));
    const image = { type: "image" as const, uri: "asset://sample" };
    expect(await run(graph, { params: { image } })).toEqual({ image });
    await expect(run(graph)).rejects.toThrow(
      "Missing required workflow inputs"
    );
  });

  test("composition preserves symbolic passthroughs and rejects duplicate invocation names", async () => {
    const identity = workflow({ value: t.string() }, ({ value }) => ({
      value
    }));
    const graph = workflow({}, () => {
      const first = identity({ value: "A" }, { id: "instance" });
      expect(first.value).toHaveProperty("nodeId");
      expect(() => identity({ value: "B" }, { id: "instance" })).toThrow(
        "Duplicate workflow scope"
      );
      return first;
    });
    expect(await run(graph)).toEqual({ value: "A" });
  });
  test("rejects asynchronous structured bodies and restores the enclosing build", () => {
    const source = string({ value: "outer" });
    expect(() => map([1], (() => Promise.resolve("late")) as never)).toThrow(
      "return synchronously"
    );
    expect(workflow(source).nodes).toHaveLength(1);
  });
  test("reuses composition scopes after a legacy graph is assembled", () => {
    const identity = workflow({ value: t.string() }, ({ value }) => ({
      value
    }));
    const first = identity({ value: "A" }, { id: "reused" });
    const node = createNode("nodetool.output.Output", {
      name: "first",
      value: first.value
    });
    workflow(node);
    const second = identity({ value: "B" }, { id: "reused" });
    const next = createNode("nodetool.output.Output", {
      name: "second",
      value: second.value
    });
    expect(
      workflow(next).nodes.some((node) => node.id === "reused/input/value")
    ).toBe(true);
  });
});
