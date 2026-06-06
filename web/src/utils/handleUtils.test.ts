import type { Node } from "@xyflow/react";
import type { NodeData } from "../stores/NodeData";
import type { NodeMetadata, TypeMetadata } from "../stores/ApiTypes";
import {
  findOutputHandle,
  findInputHandle,
  getAllOutputHandles,
  getAllInputHandles,
  hasOutputHandle,
  hasInputHandle,
} from "./handleUtils";

function makeType(type: string, optional = false): TypeMetadata {
  return { type, optional, values: null, type_args: [], type_name: null };
}

function makeMetadata(
  overrides: Partial<NodeMetadata> = {}
): NodeMetadata {
  return {
    node_type: "test.Node",
    title: "Test",
    namespace: "test",
    description: "",
    layout: "default",
    properties: [],
    outputs: [],
    ...overrides,
  } as NodeMetadata;
}

function makeNode(
  overrides: Partial<Node<NodeData>> = {}
): Node<NodeData> {
  return {
    id: "node-1",
    type: "test.Node",
    position: { x: 0, y: 0 },
    data: {
      properties: {},
      selectable: true,
      dynamic_properties: {},
      workflow_id: "wf-1",
      ...overrides.data,
    },
    ...overrides,
  } as Node<NodeData>;
}

describe("findOutputHandle", () => {
  it("finds a static output by name", () => {
    const meta = makeMetadata({
      outputs: [{ name: "output", type: makeType("str"), stream: false }],
    });
    const node = makeNode();

    const handle = findOutputHandle(node, "output", meta);
    expect(handle).toBeDefined();
    expect(handle!.name).toBe("output");
    expect(handle!.type.type).toBe("str");
    expect(handle!.isDynamic).toBe(false);
  });

  it("returns undefined for non-existent handle", () => {
    const meta = makeMetadata({ outputs: [] });
    const node = makeNode();

    expect(findOutputHandle(node, "missing", meta)).toBeUndefined();
  });

  it("finds a dynamic output", () => {
    const meta = makeMetadata({ outputs: [] });
    const node = makeNode({
      data: {
        properties: {},
        selectable: true,
        dynamic_properties: {},
        workflow_id: "wf-1",
        dynamic_outputs: { custom_out: makeType("int") },
      },
    });

    const handle = findOutputHandle(node, "custom_out", meta);
    expect(handle).toBeDefined();
    expect(handle!.isDynamic).toBe(true);
    expect(handle!.type.type).toBe("int");
  });

  it("returns effective enum type for Select nodes", () => {
    const meta = makeMetadata({
      node_type: "nodetool.input.SelectInput",
      outputs: [{ name: "output", type: makeType("str"), stream: false }],
    });
    const node = makeNode({
      data: {
        properties: {
          enum_type_name: "MyEnum",
          options: ["a", "b", "c"],
        },
        selectable: true,
        dynamic_properties: {},
        workflow_id: "wf-1",
      },
    });

    const handle = findOutputHandle(node, "output", meta);
    expect(handle).toBeDefined();
    expect(handle!.type.type).toBe("enum");
    expect(handle!.type.type_name).toBe("MyEnum");
    expect(handle!.type.values).toEqual(["a", "b", "c"]);
  });

  it("prefers static over dynamic when name matches", () => {
    const meta = makeMetadata({
      outputs: [{ name: "output", type: makeType("str"), stream: false }],
    });
    const node = makeNode({
      data: {
        properties: {},
        selectable: true,
        dynamic_properties: {},
        workflow_id: "wf-1",
        dynamic_outputs: { output: makeType("int") },
      },
    });

    const handle = findOutputHandle(node, "output", meta);
    expect(handle!.type.type).toBe("str");
    expect(handle!.isDynamic).toBe(false);
  });
});

describe("findInputHandle", () => {
  it("finds a static property by name", () => {
    const meta = makeMetadata({
      properties: [
        { name: "prompt", type: makeType("str"), required: true },
      ],
    });
    const node = makeNode();

    const handle = findInputHandle(node, "prompt", meta);
    expect(handle).toBeDefined();
    expect(handle!.name).toBe("prompt");
    expect(handle!.isDynamic).toBe(false);
  });

  it("returns undefined for non-existent handle", () => {
    const meta = makeMetadata({ properties: [] });
    const node = makeNode();

    expect(findInputHandle(node, "missing", meta)).toBeUndefined();
  });

  it("finds handles from dynamic_inputs", () => {
    const meta = makeMetadata({ properties: [] });
    const node = makeNode({
      data: {
        properties: {},
        selectable: true,
        dynamic_properties: {},
        workflow_id: "wf-1",
        dynamic_inputs: {
          layer_in_0: makeType("image"),
        },
      },
    });

    const handle = findInputHandle(node, "layer_in_0", meta);
    expect(handle).toBeDefined();
    expect(handle!.isDynamic).toBe(true);
    expect(handle!.type.type).toBe("image");
  });

  it("finds handles from dynamic_properties", () => {
    const meta = makeMetadata({ properties: [] });
    const node = makeNode({
      data: {
        properties: {},
        selectable: true,
        dynamic_properties: { template_var: "hello" },
        workflow_id: "wf-1",
      },
    });

    const handle = findInputHandle(node, "template_var", meta);
    expect(handle).toBeDefined();
    expect(handle!.isDynamic).toBe(true);
    expect(handle!.type.type).toBe("any");
  });

  it("does not treat dynamic-output-only names as input handles", () => {
    const meta = makeMetadata({ properties: [] });
    const node = makeNode({
      data: {
        properties: {},
        selectable: true,
        dynamic_properties: {},
        workflow_id: "wf-1",
        dynamic_outputs: { out_only: makeType("str") },
      },
    });

    expect(findInputHandle(node, "out_only", meta)).toBeUndefined();
  });
});

describe("getAllOutputHandles", () => {
  it("combines static and dynamic outputs", () => {
    const meta = makeMetadata({
      outputs: [{ name: "result", type: makeType("str"), stream: false }],
    });
    const node = makeNode({
      data: {
        properties: {},
        selectable: true,
        dynamic_properties: {},
        workflow_id: "wf-1",
        dynamic_outputs: { extra: makeType("int") },
      },
    });

    const handles = getAllOutputHandles(node, meta);
    expect(handles).toHaveLength(2);
    expect(handles[0].name).toBe("result");
    expect(handles[0].isDynamic).toBe(false);
    expect(handles[1].name).toBe("extra");
    expect(handles[1].isDynamic).toBe(true);
  });
});

describe("getAllInputHandles", () => {
  it("combines static properties and dynamic inputs", () => {
    const meta = makeMetadata({
      properties: [
        { name: "prompt", type: makeType("str"), required: true },
      ],
    });
    const node = makeNode({
      data: {
        properties: {},
        selectable: true,
        dynamic_properties: { var1: "test" },
        workflow_id: "wf-1",
      },
    });

    const handles = getAllInputHandles(node, meta);
    expect(handles).toHaveLength(2);
    expect(handles.find((h) => h.name === "prompt")!.isDynamic).toBe(false);
    expect(handles.find((h) => h.name === "var1")!.isDynamic).toBe(true);
  });

  it("deduplicates names (static wins)", () => {
    const meta = makeMetadata({
      properties: [
        { name: "value", type: makeType("str"), required: true },
      ],
    });
    const node = makeNode({
      data: {
        properties: {},
        selectable: true,
        dynamic_properties: { value: "duplicate" },
        workflow_id: "wf-1",
      },
    });

    const handles = getAllInputHandles(node, meta);
    const valueHandles = handles.filter((h) => h.name === "value");
    expect(valueHandles).toHaveLength(1);
    expect(valueHandles[0].isDynamic).toBe(false);
  });

  it("excludes dynamic-output-only names", () => {
    const meta = makeMetadata({ properties: [] });
    const node = makeNode({
      data: {
        properties: {},
        selectable: true,
        dynamic_properties: {},
        workflow_id: "wf-1",
        dynamic_outputs: { out_only: makeType("str") },
      },
    });

    const handles = getAllInputHandles(node, meta);
    expect(handles.find((h) => h.name === "out_only")).toBeUndefined();
  });
});

describe("hasOutputHandle / hasInputHandle", () => {
  it("hasOutputHandle returns true for existing handle", () => {
    const meta = makeMetadata({
      outputs: [{ name: "output", type: makeType("str"), stream: false }],
    });
    expect(hasOutputHandle(makeNode(), "output", meta)).toBe(true);
  });

  it("hasOutputHandle returns false for missing handle", () => {
    expect(hasOutputHandle(makeNode(), "missing", makeMetadata())).toBe(false);
  });

  it("hasInputHandle returns true for existing handle", () => {
    const meta = makeMetadata({
      properties: [
        { name: "input", type: makeType("str"), required: true },
      ],
    });
    expect(hasInputHandle(makeNode(), "input", meta)).toBe(true);
  });

  it("hasInputHandle returns false for missing handle", () => {
    expect(hasInputHandle(makeNode(), "missing", makeMetadata())).toBe(false);
  });
});
