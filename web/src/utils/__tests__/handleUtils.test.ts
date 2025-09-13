import { Node } from "@xyflow/react";
import {
  findOutputHandle,
  findInputHandle,
  getAllOutputHandles,
  getAllInputHandles,
  hasOutputHandle,
  hasInputHandle,
  OutputHandle,
  InputHandle
} from "../handleUtils";
import { NodeData } from "../../stores/NodeData";
import {
  NodeMetadata,
  OutputSlot,
  Property,
  TypeMetadata
} from "../../stores/ApiTypes";

// Test data setup
const mockTypeMetadata: TypeMetadata = {
  type: "str",
  optional: false,
  values: null,
  type_args: [],
  type_name: null
};

const mockIntTypeMetadata: TypeMetadata = {
  type: "int",
  optional: false,
  values: null,
  type_args: [],
  type_name: null
};

const mockFloatTypeMetadata: TypeMetadata = {
  type: "float",
  optional: false,
  values: null,
  type_args: [],
  type_name: null
};

const mockDynamicTypeMetadata: TypeMetadata = {
  type: "bool",
  optional: false,
  values: null,
  type_args: [],
  type_name: null
};

const mockStaticOutputs: OutputSlot[] = [
  {
    name: "output",
    type: mockTypeMetadata,
    stream: false
  },
  {
    name: "result",
    type: mockIntTypeMetadata,
    stream: true
  }
];

const mockStaticProperties: Property[] = [
  {
    name: "input",
    type: mockTypeMetadata,
    default: "",
    title: "Input",
    description: "Input text"
  },
  {
    name: "value",
    type: mockFloatTypeMetadata,
    default: 0.0,
    title: "Value",
    description: "Numeric value"
  }
];

const mockNodeMetadata: NodeMetadata = {
  node_type: "test.node",
  title: "Test Node",
  description: "A test node",
  namespace: "test",
  outputs: mockStaticOutputs,
  properties: mockStaticProperties,
  is_dynamic: false,
  supports_dynamic_outputs: false,
  layout: "default",
  expose_as_tool: false,
  the_model_info: {},
  recommended_models: [],
  basic_fields: []
};

const mockDynamicNodeMetadata: NodeMetadata = {
  ...mockNodeMetadata,
  node_type: "test.dynamic",
  title: "Dynamic Test Node",
  is_dynamic: true,
  supports_dynamic_outputs: true
};

const createMockNode = (
  id: string = "test-node",
  dynamicOutputs: Record<string, TypeMetadata> = {},
  dynamicProperties: Record<string, any> = {}
): Node<NodeData> => ({
  id,
  type: "test.node",
  position: { x: 0, y: 0 },
  data: {
    properties: {},
    collapsed: false,
    selectable: true,
    workflow_id: "test-workflow",
    dynamic_properties: dynamicProperties,
    dynamic_outputs: dynamicOutputs
  }
});

describe("handleUtils", () => {
  describe("findOutputHandle", () => {
    it("should find static output handles", () => {
      const node = createMockNode();
      const handle = findOutputHandle(node, "output", mockNodeMetadata);

      expect(handle).toEqual({
        name: "output",
        type: mockTypeMetadata,
        stream: false,
        isDynamic: false
      });
    });

    it("should find dynamic output handles", () => {
      const dynamicOutputs = { dynamic_output: mockDynamicTypeMetadata };
      const node = createMockNode("test", dynamicOutputs);
      const handle = findOutputHandle(
        node,
        "dynamic_output",
        mockDynamicNodeMetadata
      );

      expect(handle).toEqual({
        name: "dynamic_output",
        type: mockDynamicTypeMetadata,
        stream: false,
        isDynamic: true
      });
    });

    it("should return undefined for non-existent handles", () => {
      const node = createMockNode();
      const handle = findOutputHandle(node, "nonexistent", mockNodeMetadata);

      expect(handle).toBeUndefined();
    });

    it("should prioritize static outputs over dynamic ones", () => {
      const dynamicOutputs = { output: mockDynamicTypeMetadata };
      const node = createMockNode("test", dynamicOutputs);
      const handle = findOutputHandle(node, "output", mockNodeMetadata);

      expect(handle).toEqual({
        name: "output",
        type: mockTypeMetadata, // Should be the static type, not dynamic
        stream: false,
        isDynamic: false
      });
    });
  });

  describe("findInputHandle", () => {
    it("should find static input handles", () => {
      const node = createMockNode();
      const handle = findInputHandle(node, "input", mockNodeMetadata);

      expect(handle).toEqual({
        name: "input",
        type: mockTypeMetadata,
        isDynamic: false
      });
    });

    it("should find dynamic input handles for dynamic nodes", () => {
      const dynamicProperties = { dynamic_input: "test_value" };
      const node = createMockNode("test", {}, dynamicProperties);
      const handle = findInputHandle(
        node,
        "dynamic_input",
        mockDynamicNodeMetadata
      );

      expect(handle).toEqual({
        name: "dynamic_input",
        type: {
          type: "any",
          optional: false,
          values: null,
          type_args: [],
          type_name: null
        },
        isDynamic: true
      });
    });

    it("should return undefined for dynamic properties on non-dynamic nodes", () => {
      const dynamicProperties = { dynamic_input: "test_value" };
      const node = createMockNode("test", {}, dynamicProperties);
      const handle = findInputHandle(node, "dynamic_input", mockNodeMetadata); // Non-dynamic metadata

      expect(handle).toBeUndefined();
    });

    it("should return undefined for non-existent handles", () => {
      const node = createMockNode();
      const handle = findInputHandle(node, "nonexistent", mockNodeMetadata);

      expect(handle).toBeUndefined();
    });

    it("should prioritize static properties over dynamic ones", () => {
      const dynamicProperties = { input: "test_value" };
      const node = createMockNode("test", {}, dynamicProperties);
      const handle = findInputHandle(node, "input", mockDynamicNodeMetadata);

      expect(handle).toEqual({
        name: "input",
        type: mockTypeMetadata, // Should be the static type, not dynamic string
        isDynamic: false
      });
    });
  });

  describe("getAllOutputHandles", () => {
    it("should return all static output handles", () => {
      const node = createMockNode();
      const handles = getAllOutputHandles(node, mockNodeMetadata);

      expect(handles).toHaveLength(2);
      expect(handles).toEqual([
        {
          name: "output",
          type: mockTypeMetadata,
          stream: false,
          isDynamic: false
        },
        {
          name: "result",
          type: mockIntTypeMetadata,
          stream: true,
          isDynamic: false
        }
      ]);
    });

    it("should return static and dynamic output handles", () => {
      const dynamicOutputs = {
        dynamic1: mockDynamicTypeMetadata,
        dynamic2: mockFloatTypeMetadata
      };
      const node = createMockNode("test", dynamicOutputs);
      const handles = getAllOutputHandles(node, mockNodeMetadata);

      expect(handles).toHaveLength(4); // 2 static + 2 dynamic

      // Check static handles
      expect(handles.slice(0, 2)).toEqual([
        {
          name: "output",
          type: mockTypeMetadata,
          stream: false,
          isDynamic: false
        },
        {
          name: "result",
          type: mockIntTypeMetadata,
          stream: true,
          isDynamic: false
        }
      ]);

      // Check dynamic handles
      expect(handles.slice(2)).toEqual([
        {
          name: "dynamic1",
          type: mockDynamicTypeMetadata,
          stream: false,
          isDynamic: true
        },
        {
          name: "dynamic2",
          type: mockFloatTypeMetadata,
          stream: false,
          isDynamic: true
        }
      ]);
    });

    it("should handle nodes with no dynamic outputs", () => {
      const node = createMockNode();
      const handles = getAllOutputHandles(node, mockNodeMetadata);

      expect(handles).toHaveLength(2);
      expect(handles.every((h) => !h.isDynamic)).toBe(true);
    });
  });

  describe("getAllInputHandles", () => {
    it("should return all static input handles", () => {
      const node = createMockNode();
      const handles = getAllInputHandles(node, mockNodeMetadata);

      expect(handles).toHaveLength(2);
      expect(handles).toEqual([
        {
          name: "input",
          type: mockTypeMetadata,
          isDynamic: false
        },
        {
          name: "value",
          type: mockFloatTypeMetadata,
          isDynamic: false
        }
      ]);
    });

    it("should return static and dynamic input handles for dynamic nodes", () => {
      const dynamicProperties = {
        dynamic1: "value1",
        dynamic2: "value2"
      };
      const node = createMockNode("test", {}, dynamicProperties);
      const handles = getAllInputHandles(node, mockDynamicNodeMetadata);

      expect(handles).toHaveLength(4); // 2 static + 2 dynamic

      // Check static handles
      expect(handles.slice(0, 2)).toEqual([
        {
          name: "input",
          type: mockTypeMetadata,
          isDynamic: false
        },
        {
          name: "value",
          type: mockFloatTypeMetadata,
          isDynamic: false
        }
      ]);

      // Check dynamic handles
      expect(handles.slice(2)).toEqual([
        {
          name: "dynamic1",
          type: {
            type: "any",
            optional: false,
            values: null,
            type_args: [],
            type_name: null
          },
          isDynamic: true
        },
        {
          name: "dynamic2",
          type: {
            type: "any",
            optional: false,
            values: null,
            type_args: [],
            type_name: null
          },
          isDynamic: true
        }
      ]);
    });

    it("should not return dynamic handles for non-dynamic nodes", () => {
      const dynamicProperties = { dynamic1: "value1" };
      const node = createMockNode("test", {}, dynamicProperties);
      const handles = getAllInputHandles(node, mockNodeMetadata); // Non-dynamic metadata

      expect(handles).toHaveLength(2); // Only static handles
      expect(handles.every((h) => !h.isDynamic)).toBe(true);
    });
  });

  describe("hasOutputHandle", () => {
    it("should return true for existing static output handles", () => {
      const node = createMockNode();
      expect(hasOutputHandle(node, "output", mockNodeMetadata)).toBe(true);
      expect(hasOutputHandle(node, "result", mockNodeMetadata)).toBe(true);
    });

    it("should return true for existing dynamic output handles", () => {
      const dynamicOutputs = { dynamic_output: mockDynamicTypeMetadata };
      const node = createMockNode("test", dynamicOutputs);
      expect(
        hasOutputHandle(node, "dynamic_output", mockDynamicNodeMetadata)
      ).toBe(true);
    });

    it("should return false for non-existent handles", () => {
      const node = createMockNode();
      expect(hasOutputHandle(node, "nonexistent", mockNodeMetadata)).toBe(
        false
      );
    });
  });

  describe("hasInputHandle", () => {
    it("should return true for existing static input handles", () => {
      const node = createMockNode();
      expect(hasInputHandle(node, "input", mockNodeMetadata)).toBe(true);
      expect(hasInputHandle(node, "value", mockNodeMetadata)).toBe(true);
    });

    it("should return true for existing dynamic input handles on dynamic nodes", () => {
      const dynamicProperties = { dynamic_input: "test_value" };
      const node = createMockNode("test", {}, dynamicProperties);
      expect(
        hasInputHandle(node, "dynamic_input", mockDynamicNodeMetadata)
      ).toBe(true);
    });

    it("should return false for dynamic properties on non-dynamic nodes", () => {
      const dynamicProperties = { dynamic_input: "test_value" };
      const node = createMockNode("test", {}, dynamicProperties);
      expect(hasInputHandle(node, "dynamic_input", mockNodeMetadata)).toBe(
        false
      );
    });

    it("should return false for non-existent handles", () => {
      const node = createMockNode();
      expect(hasInputHandle(node, "nonexistent", mockNodeMetadata)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should handle nodes with empty dynamic outputs", () => {
      const node = createMockNode("test", {});
      const handles = getAllOutputHandles(node, mockNodeMetadata);
      expect(handles).toHaveLength(2); // Only static
    });

    it("should handle nodes with empty dynamic properties", () => {
      const node = createMockNode("test", {}, {});
      const handles = getAllInputHandles(node, mockDynamicNodeMetadata);
      expect(handles).toHaveLength(2); // Only static
    });

    it("should handle missing dynamic_outputs property", () => {
      const node = createMockNode();
      delete (node.data as any).dynamic_outputs;
      expect(hasOutputHandle(node, "output", mockNodeMetadata)).toBe(true);
      expect(hasOutputHandle(node, "nonexistent", mockNodeMetadata)).toBe(
        false
      );
    });

    it("should handle missing dynamic_properties property", () => {
      const node = createMockNode();
      delete (node.data as any).dynamic_properties;
      expect(hasInputHandle(node, "input", mockNodeMetadata)).toBe(true);
      expect(hasInputHandle(node, "nonexistent", mockDynamicNodeMetadata)).toBe(
        false
      );
    });
  });
});
