/**
 * The bug this pins: an authored graph could not declare a dynamic output
 * handle, so a Code node returning `{ line }` and wired onward by `line`
 * reported `code_undeclared_output` — and no graph the agent could write would
 * fix it. A named return/emit is a handle now, and an outgoing edge still
 * declares one the body has not named yet.
 */
import { describe, it, expect } from "vitest";
import { validateGraph } from "@nodetool-ai/node-sdk";
import { GraphBuilder } from "../src/graph-builder.js";
import { metadataAwareRegistry } from "../src/tools/graph-validation-registry.js";
import { declareDynamicOutputsInGraph } from "../src/dynamic-slots.js";

const CODE_META = {
  properties: [
    { name: "code", type: { type: "str" } },
    { name: "packages", type: { type: "list", type_args: [{ type: "str" }] } }
  ],
  outputs: [{ name: "output", type: { type: "any" } }],
  supports_dynamic_inputs: true,
  supports_dynamic_outputs: true
};

const OUTPUT_META = {
  properties: [
    { name: "name", type: { type: "str" } },
    { name: "value", type: { type: "any" } }
  ],
  outputs: [{ name: "output", type: { type: "any" } }]
};

const registry = {
  has: (t: string) => t === "nodetool.code.Code" || t === "nodetool.output.Output",
  getMetadata: (t: string) =>
    t === "nodetool.code.Code" ? CODE_META : t === "nodetool.output.Output" ? OUTPUT_META : undefined,
  validateNode: () => []
} as never;

const CODE_BODY = 'const line = "hello";\nreturn { line };';

/** Codes of the code-body issues the validator can raise about outputs. */
function outputIssueCodes(graph: unknown): string[] {
  const report = validateGraph(graph as never, metadataAwareRegistry(registry));
  return report.issues.map((i) => i.code);
}

interface JsonNode {
  id: string;
  type: string;
  properties?: Record<string, unknown>;
  dynamic_outputs?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

interface JsonGraph {
  nodes: JsonNode[];
  edges: Record<string, unknown>[];
}

/** The same graph the DSL pack emits: plain JSON, no `dynamic_outputs`. */
function jsonGraph(): JsonGraph {
  return {
    nodes: [
      { id: "code", type: "nodetool.code.Code", properties: { code: CODE_BODY } },
      { id: "out", type: "nodetool.output.Output", properties: { name: "line" } }
    ],
    edges: [
      {
        id: "e1",
        source: "code",
        sourceHandle: "line",
        target: "out",
        targetHandle: "value"
      }
    ]
  };
}

describe("a Code node's returned key wired onward", () => {
  it("validates as plain JSON with no undeclared-output issue", () => {
    const declared = declareDynamicOutputsInGraph(
      jsonGraph(),
      registry
    ) as JsonGraph;

    expect(declared.nodes[0].dynamic_outputs).toEqual({ line: { type: "any" } });
    expect(outputIssueCodes(declared)).not.toContain("code_undeclared_output");
  });

  it("treats a returned key as a handle even when nothing declares it", () => {
    const builder = new GraphBuilder();
    builder.addNode("code", "nodetool.code.Code", {
      code: CODE_BODY
    });

    expect(outputIssueCodes(builder.snapshot())).not.toContain(
      "code_undeclared_output"
    );
  });
});

describe("declaring dynamic outputs on a graph that arrives as JSON", () => {
  it("writes nothing for a node type that does not support dynamic outputs", () => {
    const graph = jsonGraph();
    graph.edges[0] = {
      id: "e1",
      source: "out",
      sourceHandle: "extra",
      target: "code",
      targetHandle: "value"
    };

    const declared = declareDynamicOutputsInGraph(graph, registry) as JsonGraph;

    expect(declared.nodes[1].dynamic_outputs).toBeUndefined();
    expect(declared).toEqual(graph);
  });

  it("leaves a handle the graph already declares alone", () => {
    const graph = jsonGraph();
    graph.nodes[0].dynamic_outputs = { line: { type: "str" } };

    const declared = declareDynamicOutputsInGraph(graph, registry) as JsonGraph;

    expect(declared.nodes[0].dynamic_outputs).toEqual({ line: { type: "str" } });
  });

  it("reads a declaration nested under the stored node shape", () => {
    const graph = jsonGraph();
    graph.nodes[0].data = { dynamic_outputs: { line: { type: "str" } } };

    const declared = declareDynamicOutputsInGraph(graph, registry) as JsonGraph;

    expect(declared.nodes[0].dynamic_outputs).toBeUndefined();
  });

  it("declares nothing and does not throw when the registry knows no type", () => {
    const graph = jsonGraph();
    const empty = { getMetadata: () => undefined };

    const declared = declareDynamicOutputsInGraph(graph, empty) as JsonGraph;

    expect(declared).toEqual(graph);
    expect(declared.nodes[0].dynamic_outputs).toBeUndefined();
  });

  it("returns a value it was given that is not a graph", () => {
    expect(declareDynamicOutputsInGraph(null, registry)).toBeNull();
    expect(declareDynamicOutputsInGraph({ nodes: [] }, registry)).toEqual({
      nodes: []
    });
  });
});
