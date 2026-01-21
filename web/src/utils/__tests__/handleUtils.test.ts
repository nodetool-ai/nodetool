import { Node, Position } from "@xyflow/react";
import { NodeMetadata } from "../../stores/ApiTypes";
import { NodeData } from "../../stores/NodeData";
import {
  findOutputHandle,
  findInputHandle,
  getAllOutputHandles,
  getAllInputHandles,
  hasOutputHandle,
  hasInputHandle
} from "../handleUtils";

const createMockNode = (overrides: Partial<Node<NodeData>> = {}): Node<NodeData> => ({
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
    ...overrides.data
  },
  ...overrides
});

const createMockMetadata = (overrides: Partial<NodeMetadata> = {}): NodeMetadata => ({
  namespace: "default",
  node_type: "test.node",
  properties: [
    { name: "input1", type: { type: "string", optional: false, values: null, type_args: [], type_name: null }, default: "", required: true },
    { name: "input2", type: { type: "number", optional: true, values: null, type_args: [], type_name: null }, default: 0, required: false }
  ],
  title: "Test Node",
  description: "A test node",
  outputs: [
    { name: "output1", type: { type: "string", optional: false, values: null, type_args: [], type_name: null }, stream: false },
    { name: "output2", type: { type: "number", optional: false, values: null, type_args: [], type_name: null }, stream: false }
  ],
  the_model_info: {},
  layout: "default",
  recommended_models: [],
  basic_fields: [],
  is_dynamic: false,
  expose_as_tool: false,
  supports_dynamic_outputs: false,
  is_streaming_output: false,
  ...overrides
});

describe("handleUtils", () => {
  describe("findOutputHandle", () => {
    it("returns static output handle when found", () => {
      const node = createMockNode();
      const metadata = createMockMetadata();

      const handle = findOutputHandle(node, "output1", metadata);

      expect(handle).toBeDefined();
      expect(handle?.name).toBe("output1");
      expect(handle?.isDynamic).toBe(false);
      expect(handle?.stream).toBe(false);
    });

    it("returns undefined when static output not found", () => {
      const node = createMockNode();
      const metadata = createMockMetadata();

      const handle = findOutputHandle(node, "nonexistent", metadata);

      expect(handle).toBeUndefined();
    });

    it("returns dynamic output when static output not found but dynamic exists", () => {
      const node = createMockNode({
        data: {
          properties: {},
          dynamic_properties: {},
          selectable: true,
          workflow_id: "test-workflow",
          dynamic_outputs: {
            dynamicOutput: { type: "any", optional: false, values: null, type_args: [], type_name: null }
          }
        }
      });
      const metadata = createMockMetadata();

      const handle = findOutputHandle(node, "dynamicOutput", metadata);

      expect(handle).toBeDefined();
      expect(handle?.name).toBe("dynamicOutput");
      expect(handle?.isDynamic).toBe(true);
    });

    it("prefers static output over dynamic output", () => {
      const node = createMockNode({
        data: {
          properties: {},
          dynamic_properties: {},
          selectable: true,
          workflow_id: "test-workflow",
          dynamic_outputs: {
            output1: { type: "any", optional: false, values: null, type_args: [], type_name: null }
          }
        }
      });
      const metadata = createMockMetadata();

      const handle = findOutputHandle(node, "output1", metadata);

      expect(handle).toBeDefined();
      expect(handle?.isDynamic).toBe(false);
    });
  });

  describe("findInputHandle", () => {
    it("returns static input handle when found", () => {
      const node = createMockNode();
      const metadata = createMockMetadata();

      const handle = findInputHandle(node, "input1", metadata);

      expect(handle).toBeDefined();
      expect(handle?.name).toBe("input1");
      expect(handle?.isDynamic).toBe(false);
    });

    it("returns undefined when static input not found", () => {
      const node = createMockNode();
      const metadata = createMockMetadata();

      const handle = findInputHandle(node, "nonexistent", metadata);

      expect(handle).toBeUndefined();
    });

    it("returns dynamic input for dynamic node when property exists", () => {
      const node = createMockNode({
        data: {
          properties: {},
          dynamic_properties: {
            dynamicProp: { type: "any", optional: false, values: null, type_args: [], type_name: null }
          },
          selectable: true,
          workflow_id: "test-workflow"
        }
      });
      const metadata = createMockMetadata({ is_dynamic: true });

      const handle = findInputHandle(node, "dynamicProp", metadata);

      expect(handle).toBeDefined();
      expect(handle?.name).toBe("dynamicProp");
      expect(handle?.isDynamic).toBe(true);
    });

    it("returns undefined for dynamic node when property does not exist", () => {
      const node = createMockNode({
        data: {
          properties: {},
          dynamic_properties: {},
          selectable: true,
          workflow_id: "test-workflow"
        }
      });
      const metadata = createMockMetadata({ is_dynamic: true });

      const handle = findInputHandle(node, "nonexistent", metadata);

      expect(handle).toBeUndefined();
    });
  });

  describe("getAllOutputHandles", () => {
    it("returns all static and dynamic outputs", () => {
      const node = createMockNode({
        data: {
          properties: {},
          dynamic_properties: {},
          selectable: true,
          workflow_id: "test-workflow",
          dynamic_outputs: {
            dynOut: { type: "any", optional: false, values: null, type_args: [], type_name: null }
          }
        }
      });
      const metadata = createMockMetadata();

      const handles = getAllOutputHandles(node, metadata);

      expect(handles).toHaveLength(3);
      expect(handles.map(h => h.name).sort()).toEqual(["dynOut", "output1", "output2"]);
    });

    it("returns only static outputs when no dynamic outputs", () => {
      const node = createMockNode();
      const metadata = createMockMetadata();

      const handles = getAllOutputHandles(node, metadata);

      expect(handles).toHaveLength(2);
      expect(handles.map(h => h.name).sort()).toEqual(["output1", "output2"]);
    });
  });

  describe("getAllInputHandles", () => {
    it("returns all static and dynamic inputs for dynamic node", () => {
      const node = createMockNode({
        data: {
          properties: {},
          dynamic_properties: {
            dynIn: { type: "any", optional: false, values: null, type_args: [], type_name: null }
          },
          selectable: true,
          workflow_id: "test-workflow"
        }
      });
      const metadata = createMockMetadata({ is_dynamic: true });

      const handles = getAllInputHandles(node, metadata);

      expect(handles).toHaveLength(3);
      expect(handles.map(h => h.name).sort()).toEqual(["dynIn", "input1", "input2"]);
    });

    it("returns only static inputs for non-dynamic node", () => {
      const node = createMockNode();
      const metadata = createMockMetadata({ is_dynamic: false });

      const handles = getAllInputHandles(node, metadata);

      expect(handles).toHaveLength(2);
      expect(handles.map(h => h.name).sort()).toEqual(["input1", "input2"]);
    });
  });

  describe("hasOutputHandle", () => {
    it("returns true when output exists", () => {
      const node = createMockNode();
      const metadata = createMockMetadata();

      expect(hasOutputHandle(node, "output1", metadata)).toBe(true);
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

      expect(hasInputHandle(node, "input1", metadata)).toBe(true);
    });

    it("returns false when input does not exist", () => {
      const node = createMockNode();
      const metadata = createMockMetadata();

      expect(hasInputHandle(node, "nonexistent", metadata)).toBe(false);
    });
  });
});
