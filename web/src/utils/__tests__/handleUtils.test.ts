import { Node, Position } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import {
  findOutputHandle,
  findInputHandle,
  getAllOutputHandles,
  getAllInputHandles,
  hasOutputHandle,
  hasInputHandle,
} from "../handleUtils";
import { NodeMetadata } from "../../stores/ApiTypes";

const createMockNode = (overrides?: Partial<Node<NodeData>>): Node<NodeData> => ({
  id: "test-node",
  type: "test",
  position: { x: 0, y: 0 },
  targetPosition: Position.Left,
  sourcePosition: Position.Right,
  data: {
    properties: {},
    dynamic_properties: {},
    selectable: true,
    workflow_id: "test-workflow",
    ...overrides?.data,
  } as NodeData,
  ...overrides,
});

const createMockMetadata = (overrides?: Partial<NodeMetadata>): NodeMetadata => ({
  namespace: "test",
  node_type: "test.node",
  properties: [
    { name: "text_input", type: { type: "str", optional: false, values: null, type_args: [], type_name: null }, default: "", description: "", secret: false },
    { name: "number_param", type: { type: "int", optional: true, values: null, type_args: [], type_name: null }, default: 0, description: "", secret: false },
  ],
  outputs: [
    { name: "text_output", type: { type: "str", optional: false, values: null, type_args: [], type_name: null }, stream: false },
    { name: "data_output", type: { type: "any", optional: false, values: null, type_args: [], type_name: null }, stream: false },
  ],
  title: "Test Node",
  description: "A test node",
  the_model_info: {},
  layout: "default",
  recommended_models: [],
  basic_fields: [],
  is_dynamic: false,
  expose_as_tool: false,
  supports_dynamic_outputs: false,
  is_streaming_output: false,
  ...overrides,
});

describe("handleUtils", () => {
  describe("findOutputHandle", () => {
    it("returns static output when found", () => {
      const node = createMockNode();
      const metadata = createMockMetadata();

      const result = findOutputHandle(node, "text_output", metadata);

      expect(result).toBeDefined();
      expect(result?.name).toBe("text_output");
      expect(result?.isDynamic).toBe(false);
    });

    it("returns undefined when static output not found", () => {
      const node = createMockNode();
      const metadata = createMockMetadata();

      const result = findOutputHandle(node, "nonexistent", metadata);

      expect(result).toBeUndefined();
    });

    it("returns dynamic output when static output not found", () => {
      const node = createMockNode({
        data: {
          dynamic_outputs: {
            dynamic_result: { type: "str", optional: false, values: null, type_args: [], type_name: null },
          },
        },
      });
      const metadata = createMockMetadata();

      const result = findOutputHandle(node, "dynamic_result", metadata);

      expect(result).toBeDefined();
      expect(result?.name).toBe("dynamic_result");
      expect(result?.isDynamic).toBe(true);
    });

    it("prefers static output over dynamic", () => {
      const node = createMockNode({
        data: {
          dynamic_outputs: {
            text_output: { type: "int", optional: false, values: null, type_args: [], type_name: null },
          },
        },
      });
      const metadata = createMockMetadata();

      const result = findOutputHandle(node, "text_output", metadata);

      expect(result).toBeDefined();
      expect(result?.isDynamic).toBe(false);
      expect(result?.type.type).toBe("str");
    });
  });

  describe("findInputHandle", () => {
    it("returns static property when found", () => {
      const node = createMockNode();
      const metadata = createMockMetadata();

      const result = findInputHandle(node, "text_input", metadata);

      expect(result).toBeDefined();
      expect(result?.name).toBe("text_input");
      expect(result?.isDynamic).toBe(false);
    });

    it("returns undefined when static property not found", () => {
      const node = createMockNode();
      const metadata = createMockMetadata();

      const result = findInputHandle(node, "nonexistent", metadata);

      expect(result).toBeUndefined();
    });

    it("returns dynamic property for dynamic node", () => {
      const node = createMockNode({
        data: {
          dynamic_properties: {
            dynamic_input: { type: "str", optional: false, values: null, type_args: [], type_name: null },
          },
        },
      });
      const metadata = createMockMetadata({ is_dynamic: true });

      const result = findInputHandle(node, "dynamic_input", metadata);

      expect(result).toBeDefined();
      expect(result?.name).toBe("dynamic_input");
      expect(result?.isDynamic).toBe(true);
    });

    it("returns undefined for dynamic property on non-dynamic node", () => {
      const node = createMockNode({
        data: {
          dynamic_properties: {
            dynamic_input: { type: "str", optional: false, values: null, type_args: [], type_name: null },
          },
        },
      });
      const metadata = createMockMetadata({ is_dynamic: false });

      const result = findInputHandle(node, "dynamic_input", metadata);

      expect(result).toBeUndefined();
    });
  });

  describe("getAllOutputHandles", () => {
    it("returns all static outputs", () => {
      const node = createMockNode();
      const metadata = createMockMetadata();

      const result = getAllOutputHandles(node, metadata);

      expect(result).toHaveLength(2);
      expect(result.map((h) => h.name)).toContain("text_output");
      expect(result.map((h) => h.name)).toContain("data_output");
    });

    it("includes dynamic outputs", () => {
      const node = createMockNode({
        data: {
          dynamic_outputs: {
            dyn1: { type: "str", optional: false, values: null, type_args: [], type_name: null },
            dyn2: { type: "int", optional: false, values: null, type_args: [], type_name: null },
          },
        },
      });
      const metadata = createMockMetadata();

      const result = getAllOutputHandles(node, metadata);

      expect(result).toHaveLength(4);
      expect(result.find((h) => h.name === "dyn1")?.isDynamic).toBe(true);
      expect(result.find((h) => h.name === "dyn2")?.isDynamic).toBe(true);
    });
  });

  describe("getAllInputHandles", () => {
    it("returns all static properties", () => {
      const node = createMockNode();
      const metadata = createMockMetadata();

      const result = getAllInputHandles(node, metadata);

      expect(result).toHaveLength(2);
      expect(result.map((h) => h.name)).toContain("text_input");
      expect(result.map((h) => h.name)).toContain("number_param");
    });

    it("includes dynamic properties for dynamic node", () => {
      const node = createMockNode({
        data: {
          dynamic_properties: {
            dyn_prop: { type: "any", optional: false, values: null, type_args: [], type_name: null },
          },
        },
      });
      const metadata = createMockMetadata({ is_dynamic: true });

      const result = getAllInputHandles(node, metadata);

      expect(result).toHaveLength(3);
      expect(result.find((h) => h.name === "dyn_prop")?.isDynamic).toBe(true);
    });

    it("excludes dynamic properties for non-dynamic node", () => {
      const node = createMockNode({
        data: {
          dynamic_properties: {
            dyn_prop: { type: "any", optional: false, values: null, type_args: [], type_name: null },
          },
        },
      });
      const metadata = createMockMetadata({ is_dynamic: false });

      const result = getAllInputHandles(node, metadata);

      expect(result).toHaveLength(2);
      expect(result.find((h) => h.name === "dyn_prop")).toBeUndefined();
    });
  });

  describe("hasOutputHandle", () => {
    it("returns true when output exists", () => {
      const node = createMockNode();
      const metadata = createMockMetadata();

      expect(hasOutputHandle(node, "text_output", metadata)).toBe(true);
    });

    it("returns false when output does not exist", () => {
      const node = createMockNode();
      const metadata = createMockMetadata();

      expect(hasOutputHandle(node, "nonexistent", metadata)).toBe(false);
    });
  });

  describe("hasInputHandle", () => {
    it("returns true when input exists", () => {
      const node = createMockNode();
      const metadata = createMockMetadata();

      expect(hasInputHandle(node, "text_input", metadata)).toBe(true);
    });

    it("returns false when input does not exist", () => {
      const node = createMockNode();
      const metadata = createMockMetadata();

      expect(hasInputHandle(node, "nonexistent", metadata)).toBe(false);
    });
  });
});
