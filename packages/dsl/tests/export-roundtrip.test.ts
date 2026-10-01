import { describe, expect, test } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tsImport } from "tsx/esm/api";
import { workflowToDsl } from "../src/export.js";
import type { Workflow } from "../src/core.js";

async function rebuild(
  graph: Parameters<typeof workflowToDsl>[0]
): Promise<Workflow> {
  const directory = await mkdtemp(join(import.meta.dirname, ".dsl-roundtrip-"));
  try {
    const file = join(directory, "workflow.ts");
    await writeFile(file, workflowToDsl(graph));
    const module = await tsImport(file, import.meta.url);
    return module.exportedWorkflow as Workflow;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("canonical graph source", () => {
  test("rebuilds graph semantics and authored identity through generated and fallback factories", async () => {
    const nodes = [
      {
        id: "prompt",
        type: "nodetool.constant.String",
        properties: { value: "hello" }
      },
      {
        id: "custom",
        type: "custom.Transform",
        properties: { suffix: "!" },
        outputs: { text: "str" }
      },
      {
        id: "result",
        type: "nodetool.output.Output",
        properties: { name: "result" }
      }
    ];
    const edges = [
      {
        source: "prompt",
        sourceHandle: "output",
        target: "custom",
        targetHandle: "text"
      },
      {
        source: "custom",
        sourceHandle: "text",
        target: "result",
        targetHandle: "value"
      }
    ];
    const rebuilt = await rebuild({ nodes, edges });
    expect(
      rebuilt.nodes.map(({ id, type, data }) => ({
        id,
        type,
        properties: data
      }))
    ).toEqual(
      nodes.map(({ id, type, properties }) => ({ id, type, properties }))
    );
    expect(rebuilt.edges).toHaveLength(edges.length);
    expect(rebuilt.edges).toEqual(expect.arrayContaining(edges));
  });
});

test("round-trips lowered branch and map graphs with dynamic ports and correlations", async () => {
  const { workflow, t, map, choose, template, toKernelGraph } =
    await import("../src/authoring.js");
  const { run } = await import("../src/core.js");
  const original = workflow(
    { items: t.list(t.string()), yes: t.boolean() },
    ({ items, yes }) => ({
      values: map(items, (item) =>
        choose(yes, { then: () => template`Hi ${item}`, else: () => "no" })
      )
    })
  );
  const rebuilt = await rebuild(toKernelGraph(original));
  const originalDynamic = original.nodes.filter((node) => node.dynamic_outputs);
  expect(originalDynamic.length).toBeGreaterThan(0);
  for (const node of originalDynamic) {
    expect(
      rebuilt.nodes.find((candidate) => candidate.id === node.id)
    ).toMatchObject({
      dynamic_outputs: node.dynamic_outputs,
      output_correlation: node.output_correlation
    });
  }
  expect(rebuilt.edges).toEqual(expect.arrayContaining(original.edges));
  expect(rebuilt.edges).toHaveLength(original.edges.length);
  for (const yes of [true, false]) {
    const params = { items: ["A", "B"], yes };
    expect(await run(rebuilt, { params })).toEqual(
      await run(original, { params })
    );
  }
});
