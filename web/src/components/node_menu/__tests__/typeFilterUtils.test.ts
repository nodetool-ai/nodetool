/**
 * @jest-environment node
 */
import {
  typeTreeContains,
  filterTypesByInputExact,
  filterTypesByOutputExact,
  filterDataByExactType,
  filterTypesByInputType,
  filterTypesByOutputType,
} from "../typeFilterUtils";
import type { NodeMetadata, TypeMetadata } from "../../../stores/ApiTypes";

function makeType(type: string, overrides?: Partial<TypeMetadata>): TypeMetadata {
  return {
    type,
    optional: false,
    values: null,
    type_args: [],
    type_name: null,
    ...overrides,
  };
}

function makeNode(overrides: Partial<NodeMetadata>): NodeMetadata {
  return {
    title: "Test",
    description: "",
    namespace: "test",
    node_type: "test.Node",
    properties: [],
    outputs: [],
    layout: "default",
    supports_dynamic_inputs: false,
    is_streaming_output: false,
    supports_dynamic_outputs: false,
    recommended_models: [],
    required_settings: [],
    ...overrides,
  };
}

describe("typeTreeContains", () => {
  it("returns true for direct type match", () => {
    expect(typeTreeContains(makeType("str"), "str")).toBe(true);
  });

  it("returns false when types differ", () => {
    expect(typeTreeContains(makeType("str"), "int")).toBe(false);
  });

  it("returns false for undefined metadata", () => {
    expect(typeTreeContains(undefined, "str")).toBe(false);
  });

  it("searches nested type_args", () => {
    const listOfStr = makeType("list", { type_args: [makeType("str")] });
    expect(typeTreeContains(listOfStr, "str")).toBe(true);
    expect(typeTreeContains(listOfStr, "int")).toBe(false);
  });

  it("searches deeply nested type_args", () => {
    const nested = makeType("dict", {
      type_args: [makeType("str"), makeType("list", { type_args: [makeType("int")] })],
    });
    expect(typeTreeContains(nested, "int")).toBe(true);
    expect(typeTreeContains(nested, "float")).toBe(false);
  });
});

describe("filterTypesByInputExact", () => {
  const strNode = makeNode({
    title: "StrNode",
    properties: [{ name: "text", type: makeType("str"), default: "", description: "", required: false }],
  });
  const intNode = makeNode({
    title: "IntNode",
    properties: [{ name: "value", type: makeType("int"), default: 0, description: "", required: false }],
  });
  const anyNode = makeNode({
    title: "AnyNode",
    properties: [{ name: "input", type: makeType("any"), default: null, description: "", required: false }],
  });
  const nodes = [strNode, intNode, anyNode];

  it("filters nodes by exact input type", () => {
    const result = filterTypesByInputExact(nodes, "str");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("StrNode");
  });

  it("filters for 'any' type specifically", () => {
    const result = filterTypesByInputExact(nodes, "any");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("AnyNode");
  });

  it("returns all nodes when inputType is empty", () => {
    const result = filterTypesByInputExact(nodes, "");
    expect(result).toHaveLength(3);
  });

  it("returns empty array when no match", () => {
    const result = filterTypesByInputExact(nodes, "image");
    expect(result).toHaveLength(0);
  });
});

describe("filterTypesByOutputExact", () => {
  const strOutputNode = makeNode({
    title: "StrOutput",
    outputs: [{ name: "output", type: makeType("str"), stream: false }],
  });
  const intOutputNode = makeNode({
    title: "IntOutput",
    outputs: [{ name: "output", type: makeType("int"), stream: false }],
  });
  const anyOutputNode = makeNode({
    title: "AnyOutput",
    outputs: [{ name: "output", type: makeType("any"), stream: false }],
  });
  const noOutputNode = makeNode({
    title: "NoOutput",
    outputs: [],
  });
  const nodes = [strOutputNode, intOutputNode, anyOutputNode, noOutputNode];

  it("filters nodes by exact output type", () => {
    const result = filterTypesByOutputExact(nodes, "str");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("StrOutput");
  });

  it("filters for 'any' type specifically", () => {
    const result = filterTypesByOutputExact(nodes, "any");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("AnyOutput");
  });

  it("filters for 'notype' (nodes with no outputs)", () => {
    const result = filterTypesByOutputExact(nodes, "notype");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("NoOutput");
  });

  it("returns all nodes when outputType is empty", () => {
    const result = filterTypesByOutputExact(nodes, "");
    expect(result).toHaveLength(4);
  });
});

describe("filterDataByExactType", () => {
  const textNode = makeNode({
    title: "TextNode",
    properties: [{ name: "text", type: makeType("str"), default: "", description: "", required: false }],
    outputs: [{ name: "output", type: makeType("str"), stream: false }],
  });
  const mathNode = makeNode({
    title: "MathNode",
    properties: [{ name: "a", type: makeType("int"), default: 0, description: "", required: false }],
    outputs: [{ name: "result", type: makeType("int"), stream: false }],
  });
  const nodes = [textNode, mathNode];

  it("filters by input type only", () => {
    const result = filterDataByExactType(nodes, "str", undefined);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("TextNode");
  });

  it("filters by output type only", () => {
    const result = filterDataByExactType(nodes, undefined, "int");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("MathNode");
  });

  it("filters by both input and output type", () => {
    const result = filterDataByExactType(nodes, "str", "str");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("TextNode");
  });

  it("returns all nodes when neither filter is set", () => {
    const result = filterDataByExactType(nodes, undefined, undefined);
    expect(result).toHaveLength(2);
  });

  it("returns empty when filters exclude all nodes", () => {
    const result = filterDataByExactType(nodes, "str", "int");
    expect(result).toHaveLength(0);
  });
});

describe("connection-driven filtering across `any` handles", () => {
  const strInputNode = makeNode({
    title: "StrInput",
    properties: [
      { name: "text", type: makeType("str"), default: "", description: "", required: false }
    ],
    outputs: [{ name: "output", type: makeType("str"), stream: false }]
  });
  const anyInputNode = makeNode({
    title: "AnyInput",
    properties: [
      { name: "value", type: makeType("any"), default: null, description: "", required: false }
    ],
    outputs: [{ name: "output", type: makeType("any"), stream: false }]
  });
  const intNode = makeNode({
    title: "IntNode",
    properties: [
      { name: "value", type: makeType("int"), default: 0, description: "", required: false }
    ],
    outputs: [{ name: "result", type: makeType("int"), stream: false }]
  });
  const nodes = [intNode, anyInputNode, strInputNode];

  it("offers nodes whose only compatible input is `any`", () => {
    const result = filterTypesByInputType(nodes, makeType("str"));
    expect(result.map((n) => n.title)).toContain("AnyInput");
  });

  it("offers nodes whose only compatible output is `any`", () => {
    const result = filterTypesByOutputType(nodes, makeType("str"));
    expect(result.map((n) => n.title)).toContain("AnyInput");
  });

  it("ranks an `any` input below a typed match", () => {
    const result = filterTypesByInputType(nodes, makeType("str"));
    expect(result[0].title).toBe("StrInput");
    expect(result[result.length - 1].title).toBe("AnyInput");
  });

  it("ranks an `any` output below a typed match", () => {
    const result = filterTypesByOutputType(nodes, makeType("str"));
    expect(result[0].title).toBe("StrInput");
    expect(result[result.length - 1].title).toBe("AnyInput");
  });

  it("offers every node with a typed input when dragging from an `any` output", () => {
    const result = filterTypesByInputType(nodes, makeType("any"));
    expect(result).toHaveLength(3);
  });

  it("still drops nodes with no compatible handle", () => {
    const result = filterTypesByInputType([intNode], makeType("image"));
    expect(result).toHaveLength(0);
  });
});
