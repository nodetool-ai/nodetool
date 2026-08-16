import type { Node } from "@xyflow/react";
import { stub } from "../../test-utils/doubles";

import {
  isCodeGenApplied,
  sanitizePortName,
  seedInputPortName,
  seedOutputPortName,
  uniquePortName
} from "../codeGenEntryPoints";
import type { NodeMetadata } from "../../stores/ApiTypes";
import type { NodeData } from "../../stores/NodeData";

const anyType = { type: "any", type_args: [], optional: false };

const codeMetadata = stub<NodeMetadata>({
  title: "Code",
  description: "",
  namespace: "nodetool.code",
  node_type: "nodetool.code.Code",
  layout: "default",
  properties: [
    { name: "code", type: anyType },
    { name: "timeout", type: anyType }
  ],
  outputs: [{ name: "output", type: anyType, stream: false }],
  recommended_models: [],
  supports_dynamic_inputs: true,
  supports_dynamic_outputs: true,
  is_streaming_output: false,
  required_settings: []
});

const makeNode = (data: Partial<NodeData> = {}): Node<NodeData> =>
  ({
    id: "code-1",
    type: "nodetool.code.Code",
    position: { x: 0, y: 0 },
    data: {
      properties: { code: "", timeout: 30 },
      dynamic_properties: {},
      selectable: true,
      workflow_id: "wf",
      ...data
    }
  }) as Node<NodeData>;

describe("sanitizePortName", () => {
  it("keeps a name that is already an identifier", () => {
    expect(sanitizePortName("total_rows", "value")).toBe("total_rows");
  });

  it("replaces characters that cannot appear in an identifier", () => {
    expect(sanitizePortName("layer in 1", "value")).toBe("layer_in_1");
    expect(sanitizePortName("a-b.c", "value")).toBe("a_b_c");
  });

  it("prefixes a leading digit", () => {
    expect(sanitizePortName("2nd", "value")).toBe("_2nd");
  });

  it("falls back when nothing usable is left", () => {
    expect(sanitizePortName("", "value")).toBe("value");
    expect(sanitizePortName("", "output")).toBe("output");
  });
});

describe("uniquePortName", () => {
  it("returns the base name when it is free", () => {
    expect(uniquePortName("rows", ["code", "timeout"])).toBe("rows");
  });

  it("suffixes deterministically on a collision", () => {
    expect(uniquePortName("rows", ["rows"])).toBe("rows_2");
    expect(uniquePortName("rows", ["rows", "rows_2"])).toBe("rows_3");
  });

  it("treats reserved words as taken", () => {
    expect(uniquePortName("default", [])).toBe("default_2");
    expect(uniquePortName("class", [])).toBe("class_2");
  });
});

describe("seedInputPortName", () => {
  it("uses the handle name when it does not collide", () => {
    expect(seedInputPortName("rows", codeMetadata, makeNode())).toBe("rows");
  });

  it("suffixes when the handle name is one of the node's own properties", () => {
    expect(seedInputPortName("code", codeMetadata, makeNode())).toBe("code_2");
  });

  it("suffixes when the handle name is already a dynamic slot", () => {
    const node = makeNode({
      dynamic_inputs: { rows: { type: anyType } },
      dynamic_properties: { rows: null }
    });
    expect(seedInputPortName("rows", codeMetadata, node)).toBe("rows_2");
  });
});

describe("seedOutputPortName", () => {
  it("suffixes against the node's static outputs", () => {
    expect(seedOutputPortName("output", codeMetadata, makeNode())).toBe(
      "output_2"
    );
  });

  it("suffixes against existing dynamic outputs", () => {
    const node = makeNode({ dynamic_outputs: { total: anyType } });
    expect(seedOutputPortName("total", codeMetadata, node)).toBe("total_2");
  });
});

describe("isCodeGenApplied", () => {
  it("is false for a node created only to open the dialog", () => {
    expect(isCodeGenApplied(makeNode())).toBe(false);
    expect(isCodeGenApplied(undefined)).toBe(false);
  });

  it("is true once code has been written to the node", () => {
    expect(
      isCodeGenApplied(makeNode({ properties: { code: "return { a: 1 };" } }))
    ).toBe(true);
  });
});
