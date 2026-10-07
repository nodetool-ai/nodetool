import {
  PLAN_CODE_NODE_TYPE,
  planNodeShape,
  planToPlacement
} from "@nodetool-ai/protocol";
import type { WorkflowSetupPlan } from "@nodetool-ai/protocol/api-schemas/workflows.js";

import { CODE_SNIPPETS } from "../../config/codeSnippets";
import { snippetNodeType } from "../../config/snippetMetadata";
import { resolveSnippetSteps } from "../planSnippetSteps";

const csvSnippet = CODE_SNIPPETS.find((snippet) => snippet.id === "json-csv-parse");
if (!csvSnippet) {
  throw new Error("The Parse CSV snippet is missing from the catalog.");
}
const CSV_TYPE = snippetNodeType(csvSnippet);

const typeMeta = (type: string) => ({ type, type_args: [], optional: false });

const METADATA: Record<string, Parameters<typeof planNodeShape>[0]> = {
  "nodetool.input.StringInput": {
    properties: [{ name: "name", type: typeMeta("str") }],
    outputs: [{ name: "output", type: typeMeta("str") }]
  },
  [PLAN_CODE_NODE_TYPE]: {
    inline_fields: ["code"],
    properties: [{ name: "code", type: typeMeta("str") }],
    outputs: [],
    supports_dynamic_inputs: true,
    supports_dynamic_outputs: true
  },
  "nodetool.output.Output": {
    properties: [{ name: "value", type: typeMeta("any") }],
    outputs: []
  }
};

const csvPlan = (): WorkflowSetupPlan => ({
  inputs: [{ name: "csv", type: "string", sample: "a,b\n1,2" }],
  steps: [
    {
      id: "parse",
      title: "Parse CSV",
      summary: "rows from the text",
      node_type: CSV_TYPE
    }
  ],
  outputs: [{ name: "rows", type: "list" }]
});

describe("resolveSnippetSteps", () => {
  it("turns a snippet step into a Code step carrying the snippet body", () => {
    const [step] = resolveSnippetSteps(csvPlan()).steps;
    expect(step).toMatchObject({
      node_type: PLAN_CODE_NODE_TYPE,
      code: csvSnippet.code,
      code_inputs: ["text"],
      code_outputs: ["output"]
    });
  });

  it("builds a Code node wired into the snippet's own input", () => {
    const placed = planToPlacement(resolveSnippetSteps(csvPlan()), (type) => {
      const meta = METADATA[type];
      return meta ? planNodeShape(meta) : null;
    });
    const step = placed.nodes.find((node) => node.id === "step_1");
    expect(step?.type).toBe(PLAN_CODE_NODE_TYPE);
    expect(step?.properties).toEqual({ code: csvSnippet.code });
    expect(placed.edges.map((edge) => edge.targetHandle)).toEqual([
      "text",
      "value"
    ]);
    expect(placed.issues).toEqual([]);
  });

  it("leaves a step that names a real node type alone", () => {
    const plan = csvPlan();
    plan.steps[0].node_type = "nodetool.text.Template";
    expect(resolveSnippetSteps(plan).steps[0]).toEqual(plan.steps[0]);
  });
});
