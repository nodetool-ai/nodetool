/**
 * The bug this pins: a graph authored through `submit_graph` could not declare
 * a dynamic output handle, so a Code node returning `{ line }` and wired onward
 * by `line` reported `code_undeclared_output` — and no DSL a planner could
 * write would fix it. An outgoing edge now declares the handle.
 */
import { describe, it, expect } from "vitest";
import { validateGraph } from "@nodetool-ai/node-sdk";
import { GraphBuilder } from "../src/graph-builder.js";
import { AddEdgeTool } from "../src/tools/add-edge-tool.js";
import { SubmitGraphTool } from "../src/tools/submit-graph-tool.js";
import { metadataAwareRegistry } from "../src/tools/finish-graph-tool.js";

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

const PROGRAM = `const code = node("nodetool.code.Code", {
  code: ${JSON.stringify(CODE_BODY)}
}, "code");
node("nodetool.output.Output", { name: "line", value: code.output("line") }, "out");
return graph();`;

/** Codes of the code-body issues the validator can raise about outputs. */
function outputIssueCodes(graph: unknown): string[] {
  const report = validateGraph(graph as never, metadataAwareRegistry(registry));
  return report.issues.map((i) => i.code);
}

describe("a Code node's returned key wired onward", () => {
  it("validates through submit_graph with no undeclared-output issue", async () => {
    const tool = new SubmitGraphTool(registry);
    const result = (await tool.process({} as never, { code: PROGRAM })) as {
      status: string;
      errors?: string[];
      warnings?: string[];
    };

    expect(result.errors ?? []).toEqual([]);
    expect(result.status).toBe("graph_accepted");
    expect(
      (result.warnings ?? []).filter((w) => w.includes("not declared as an output"))
    ).toEqual([]);
    expect(tool.graph!.nodes.find((n) => n.id === "code")?.dynamic_outputs).toEqual({
      line: { type: "any" }
    });
    expect(outputIssueCodes(tool.graph)).not.toContain("code_undeclared_output");
  });

  it("validates through add_edge with no undeclared-output issue", async () => {
    const builder = new GraphBuilder();
    builder.addNode("code", "nodetool.code.Code", {
      code: CODE_BODY
    });
    builder.addNode("out", "nodetool.output.Output", { name: "line" });
    const tool = new AddEdgeTool(builder, registry);

    const result = (await tool.process({} as never, {
      source: "code",
      source_handle: "line",
      target: "out",
      target_handle: "value"
    })) as { status: string };

    expect(result.status).toBe("edge_added");
    expect(builder.getNode("code")?.dynamic_outputs).toEqual({
      line: { type: "any" }
    });
    expect(outputIssueCodes(builder.snapshot())).not.toContain(
      "code_undeclared_output"
    );
  });

  it("still reports the key nothing declares and nothing reads", () => {
    const builder = new GraphBuilder();
    builder.addNode("code", "nodetool.code.Code", {
      code: CODE_BODY
    });

    expect(outputIssueCodes(builder.snapshot())).toContain(
      "code_undeclared_output"
    );
  });
});
