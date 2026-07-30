import type { codeGen } from "@nodetool-ai/protocol/api-schemas";

import {
  PREVIEW_NODE_ID,
  buildPreviewGraph,
  outputTypeWarnings,
  readPreviewOutputs
} from "../codeGenPreviewRun";

const listType: codeGen.CodeGenTypeMetadata = { type: "list", type_args: [] };
const strType: codeGen.CodeGenTypeMetadata = { type: "str", type_args: [] };

const submission: codeGen.CodeGenSubmission = {
  title: "Merge rows",
  summary: "Joins two lists.",
  code: "return { merged: [] };",
  inputs: [{ name: "rows", type: listType }],
  outputs: [{ name: "merged", type: listType }]
};

describe("buildPreviewGraph", () => {
  it("carries the code, slots and sample values onto one Code node", () => {
    const graph = buildPreviewGraph(submission, { rows: [1, 2] });

    expect(graph.edges).toEqual([]);
    expect(graph.nodes).toHaveLength(1);
    const node = graph.nodes[0];
    expect(node.id).toBe(PREVIEW_NODE_ID);
    expect(node.type).toBe("nodetool.code.Code");
    expect(node.data).toMatchObject({ code: "return { merged: [] };" });
    expect(node.dynamic_properties).toEqual({ rows: [1, 2] });
    expect(Object.keys(node.dynamic_inputs ?? {})).toEqual(["rows"]);
    expect(Object.keys(node.dynamic_outputs ?? {})).toEqual(["merged"]);
  });
});

describe("readPreviewOutputs", () => {
  it("unwraps the preview node's own result", () => {
    expect(
      readPreviewOutputs({ [PREVIEW_NODE_ID]: { merged: [1] } })
    ).toEqual({ merged: [1] });
  });

  it("falls back to the outer record when the node never reported", () => {
    expect(readPreviewOutputs({ merged: [1] })).toEqual({ merged: [1] });
  });
});

describe("outputTypeWarnings", () => {
  it("stays silent when every output matches its declared type", () => {
    expect(outputTypeWarnings(submission.outputs, { merged: [1, 2] })).toEqual(
      []
    );
  });

  it("warns when a value cannot be the declared type", () => {
    const warnings = outputTypeWarnings(submission.outputs, {
      merged: "not a list"
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/declared list but the run produced a string/i);
  });

  it("warns when a declared output is missing", () => {
    expect(outputTypeWarnings(submission.outputs, {})).toEqual([
      'Output "merged" was not produced by this run.'
    ]);
  });

  it("accepts a null value for any declared type", () => {
    expect(
      outputTypeWarnings([{ name: "text", type: strType }], { text: null })
    ).toEqual([]);
  });
});
