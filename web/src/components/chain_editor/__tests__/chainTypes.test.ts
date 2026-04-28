/**
 * @jest-environment node
 */
import {
  areTypesCompatible,
  getCompatibleInputs,
  findBestInput,
  chainToGraph,
  buildConnections,
} from "../chainTypes";
import type { ChainNode, ChainConnection } from "../chainTypes";
import type { NodeMetadata, TypeMetadata, Property } from "../../../stores/ApiTypes";

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

function makeProp(name: string, type: TypeMetadata): Property {
  return {
    name,
    type,
    default: null,
    description: "",
    required: false,
  } as Property;
}

function makeMetadata(
  properties: Property[],
  outputs: Array<{ name: string; type: TypeMetadata; stream: boolean }> = []
): NodeMetadata {
  return {
    title: "Test",
    description: "",
    namespace: "test",
    node_type: "test.Node",
    properties,
    outputs,
    layout: "default",
    is_dynamic: false,
    is_streaming_output: false,
    expose_as_tool: false,
    supports_dynamic_outputs: false,
    recommended_models: [],
    basic_fields: [],
    required_settings: [],
  } as NodeMetadata;
}

describe("areTypesCompatible", () => {
  it("same types are compatible", () => {
    expect(areTypesCompatible(makeType("str"), makeType("str"))).toBe(true);
    expect(areTypesCompatible(makeType("int"), makeType("int"))).toBe(true);
  });

  it("'any' source is compatible with any target", () => {
    expect(areTypesCompatible(makeType("any"), makeType("str"))).toBe(true);
  });

  it("any target is compatible with any source", () => {
    expect(areTypesCompatible(makeType("str"), makeType("any"))).toBe(true);
  });

  it("int is compatible with float", () => {
    expect(areTypesCompatible(makeType("int"), makeType("float"))).toBe(true);
  });

  it("float is not compatible with int", () => {
    expect(areTypesCompatible(makeType("float"), makeType("int"))).toBe(false);
  });

  it("incompatible types return false", () => {
    expect(areTypesCompatible(makeType("str"), makeType("int"))).toBe(false);
    expect(areTypesCompatible(makeType("image"), makeType("audio"))).toBe(false);
  });

  it("source matches union target if any arm matches", () => {
    const unionTarget = makeType("union", {
      type_args: [makeType("str"), makeType("int")],
    });
    expect(areTypesCompatible(makeType("str"), unionTarget)).toBe(true);
    expect(areTypesCompatible(makeType("int"), unionTarget)).toBe(true);
    expect(areTypesCompatible(makeType("float"), unionTarget)).toBe(false);
  });

  it("int matches union with float via int-to-float promotion", () => {
    const unionTarget = makeType("union", {
      type_args: [makeType("float")],
    });
    expect(areTypesCompatible(makeType("int"), unionTarget)).toBe(true);
  });

  it("list types with same element types are compatible", () => {
    const listStr = makeType("list", { type_args: [makeType("str")] });
    const listStr2 = makeType("list", { type_args: [makeType("str")] });
    expect(areTypesCompatible(listStr, listStr2)).toBe(true);
  });

  it("list types are compatible regardless of element types (same base type)", () => {
    const listStr = makeType("list", { type_args: [makeType("str")] });
    const listInt = makeType("list", { type_args: [makeType("int")] });
    expect(areTypesCompatible(listStr, listInt)).toBe(true);
  });

  it("bare list is compatible with typed list (same base type)", () => {
    const listBare = makeType("list");
    const listStr = makeType("list", { type_args: [makeType("str")] });
    expect(areTypesCompatible(listBare, listStr)).toBe(true);
  });
});

describe("getCompatibleInputs", () => {
  it("returns properties compatible with the output type", () => {
    const metadata = makeMetadata([
      makeProp("text", makeType("str")),
      makeProp("count", makeType("int")),
      makeProp("data", makeType("any")),
    ]);
    const result = getCompatibleInputs(metadata, makeType("str"));
    expect(result.map((p) => p.name)).toEqual(["text", "data"]);
  });

  it("returns empty array when no properties match", () => {
    const metadata = makeMetadata([makeProp("count", makeType("int"))]);
    const result = getCompatibleInputs(metadata, makeType("image"));
    expect(result).toHaveLength(0);
  });
});

describe("findBestInput", () => {
  it("returns the name of the first compatible input", () => {
    const metadata = makeMetadata([
      makeProp("count", makeType("int")),
      makeProp("text", makeType("str")),
    ]);
    expect(findBestInput(metadata, makeType("str"))).toBe("text");
  });

  it("returns null when no input is compatible", () => {
    const metadata = makeMetadata([makeProp("count", makeType("int"))]);
    expect(findBestInput(metadata, makeType("image"))).toBeNull();
  });
});

describe("chainToGraph", () => {
  it("converts chain nodes to workflow graph nodes", () => {
    const chain: ChainNode[] = [
      {
        id: "n1",
        nodeType: "test.A",
        metadata: makeMetadata([]),
        properties: { key: "val" },
        selectedOutput: "output",
        inputMappings: {},
        expanded: false,
      },
      {
        id: "n2",
        nodeType: "test.B",
        metadata: makeMetadata([]),
        properties: {},
        selectedOutput: "output",
        inputMappings: {},
        expanded: false,
      },
    ];
    const connections: ChainConnection[] = [
      { sourceId: "n1", sourceOutput: "output", targetId: "n2", targetInput: "input" },
    ];

    const graph = chainToGraph(chain, connections);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes[0].id).toBe("n1");
    expect(graph.nodes[0].type).toBe("test.A");
    expect(graph.nodes[0].data).toEqual({ key: "val" });
    const pos0 = (graph.nodes[0].ui_properties as { position: { y: number } }).position;
    const pos1 = (graph.nodes[1].ui_properties as { position: { y: number } }).position;
    expect(pos1.y).toBeGreaterThan(pos0.y);

    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].source).toBe("n1");
    expect(graph.edges[0].sourceHandle).toBe("output");
    expect(graph.edges[0].target).toBe("n2");
    expect(graph.edges[0].targetHandle).toBe("input");
  });

  it("returns empty graph for empty chain", () => {
    const graph = chainToGraph([], []);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
  });
});

describe("buildConnections", () => {
  it("extracts connections from inputMappings", () => {
    const chain: ChainNode[] = [
      {
        id: "n1",
        nodeType: "test.A",
        metadata: makeMetadata([]),
        properties: {},
        selectedOutput: "output",
        inputMappings: {},
        expanded: false,
      },
      {
        id: "n2",
        nodeType: "test.B",
        metadata: makeMetadata([]),
        properties: {},
        selectedOutput: "output",
        inputMappings: {
          text: { sourceNodeId: "n1", sourceOutput: "output" },
        },
        expanded: false,
      },
    ];

    const connections = buildConnections(chain);
    expect(connections).toHaveLength(1);
    expect(connections[0]).toEqual({
      sourceId: "n1",
      sourceOutput: "output",
      targetId: "n2",
      targetInput: "text",
    });
  });

  it("handles multiple input mappings per node", () => {
    const chain: ChainNode[] = [
      {
        id: "n1",
        nodeType: "test.A",
        metadata: makeMetadata([]),
        properties: {},
        selectedOutput: "output",
        inputMappings: {
          a: { sourceNodeId: "src1", sourceOutput: "out1" },
          b: { sourceNodeId: "src2", sourceOutput: "out2" },
        },
        expanded: false,
      },
    ];

    const connections = buildConnections(chain);
    expect(connections).toHaveLength(2);
  });

  it("returns empty array for chain with no mappings", () => {
    const chain: ChainNode[] = [
      {
        id: "n1",
        nodeType: "test.A",
        metadata: makeMetadata([]),
        properties: {},
        selectedOutput: "output",
        inputMappings: {},
        expanded: false,
      },
    ];
    expect(buildConnections(chain)).toHaveLength(0);
  });
});
