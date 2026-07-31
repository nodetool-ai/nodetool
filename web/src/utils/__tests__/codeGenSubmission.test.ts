import {
  codeGenSubmissionToNodeData,
  nodeInputsToCodeGenPorts
} from "../codeGenSubmission";
import type { codeGen } from "@nodetool-ai/protocol/api-schemas";

describe("codeGenSubmissionToNodeData", () => {
  const submission: codeGen.CodeGenSubmission = {
    title: "Split names",
    summary: "Splits a full name into parts.",
    code: "return { first, last };",
    inputs: [
      { name: "full", type: { type: "str", type_args: [] }, required: true },
      { name: "sep", type: { type: "str", type_args: [] }, default: " " }
    ],
    outputs: [
      { name: "first", type: { type: "str", type_args: [] } },
      { name: "last", type: { type: "str", type_args: [] } }
    ]
  };

  it("seeds each slot's inline value from its default", () => {
    const data = codeGenSubmissionToNodeData(submission, {});
    expect(data.dynamic_properties).toEqual({ full: "", sep: " " });
  });

  it("normalizes wire type metadata into full TypeMetadata", () => {
    const data = codeGenSubmissionToNodeData(submission, {});
    expect(data.dynamic_inputs.full.type).toEqual({
      type: "str",
      optional: false,
      values: null,
      type_args: [],
      type_name: null
    });
    expect(data.dynamic_outputs.last.type).toBe("str");
  });

  it("overwrites code while keeping other properties", () => {
    const data = codeGenSubmissionToNodeData(submission, {
      code: "old",
      timeout: 10
    });
    expect(data.properties).toEqual({
      code: "return { first, last };",
      timeout: 10
    });
    expect(data.title).toBe("Split names");
  });
});

describe("nodeInputsToCodeGenPorts", () => {
  it("drops slot names that are not valid identifiers", () => {
    const ports = nodeInputsToCodeGenPorts({
      rows: {
        type: {
          type: "list",
          optional: false,
          values: null,
          type_args: [],
          type_name: null
        },
        description: "the rows"
      },
      "not an identifier": {
        type: {
          type: "str",
          optional: false,
          values: null,
          type_args: [],
          type_name: null
        }
      }
    });
    expect(ports).toEqual([
      {
        name: "rows",
        type: {
          type: "list",
          optional: false,
          values: null,
          type_args: [],
          type_name: null
        },
        description: "the rows"
      }
    ]);
  });

  it("returns nothing for a node with no dynamic inputs", () => {
    expect(nodeInputsToCodeGenPorts(undefined)).toEqual([]);
  });
});
