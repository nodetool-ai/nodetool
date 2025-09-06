/**
 * Integration tests for the complete connection validation flow
 * These tests verify that the centralized handle functions work correctly
 * with the connection validation system end-to-end.
 */

import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { NodeMetadata, TypeMetadata } from "../../stores/ApiTypes";
import {
  findOutputHandle,
  findInputHandle,
  getAllOutputHandles,
  getAllInputHandles
} from "../handleUtils";
import { isConnectable } from "../TypeHandler";

// Test data setup
const stringType: TypeMetadata = {
  type: "str",
  optional: false,
  values: null,
  type_args: [],
  type_name: null
};

const intType: TypeMetadata = {
  type: "int",
  optional: false,
  values: null,
  type_args: [],
  type_name: null
};

const floatType: TypeMetadata = {
  type: "float",
  optional: false,
  values: null,
  type_args: [],
  type_name: null
};

const boolType: TypeMetadata = {
  type: "bool",
  optional: false,
  values: null,
  type_args: [],
  type_name: null
};

const anyType: TypeMetadata = {
  type: "any",
  optional: false,
  values: null,
  type_args: [],
  type_name: null
};

// Node metadata definitions
const textProcessorMetadata: NodeMetadata = {
  node_type: "text.processor",
  title: "Text Processor",
  description: "Processes text input",
  namespace: "text",
  layout: "default",
  outputs: [
    {
      name: "processed_text",
      type: stringType,
      stream: false
    },
    {
      name: "word_count",
      type: intType,
      stream: false
    }
  ],
  properties: [
    {
      name: "input_text",
      type: stringType,
      default: "",
      title: "Input Text",
      description: "Text to process"
    },
    {
      name: "case_sensitive",
      type: boolType,
      default: false,
      title: "Case Sensitive",
      description: "Whether processing is case sensitive"
    }
  ],
  is_dynamic: false,
  supports_dynamic_outputs: false,
  expose_as_tool: false,
  the_model_info: {},
  recommended_models: [],
  basic_fields: [],
  is_streaming: false
};

const mathCalculatorMetadata: NodeMetadata = {
  node_type: "math.calculator",
  title: "Math Calculator",
  description: "Performs mathematical calculations",
  namespace: "math",
  layout: "default",
  outputs: [
    {
      name: "result",
      type: floatType,
      stream: false
    }
  ],
  properties: [
    {
      name: "operand_a",
      type: floatType,
      default: 0.0,
      title: "Operand A",
      description: "First operand"
    },
    {
      name: "operand_b",
      type: floatType,
      default: 0.0,
      title: "Operand B",
      description: "Second operand"
    }
  ],
  is_dynamic: false,
  supports_dynamic_outputs: false,
  expose_as_tool: false,
  the_model_info: {},
  recommended_models: [],
  basic_fields: [],
  is_streaming: false
};

const dynamicProcessorMetadata: NodeMetadata = {
  node_type: "dynamic.processor",
  title: "Dynamic Processor",
  description: "A processor with dynamic inputs and outputs",
  namespace: "dynamic",
  layout: "default",
  outputs: [
    {
      name: "static_output",
      type: stringType,
      stream: false
    }
  ],
  properties: [
    {
      name: "static_input",
      type: stringType,
      default: "",
      title: "Static Input",
      description: "Static input property"
    }
  ],
  is_dynamic: true,
  supports_dynamic_outputs: true,
  expose_as_tool: false,
  the_model_info: {},
  recommended_models: [],
  basic_fields: [],
  is_streaming: false
};

const createTestNode = (
  id: string,
  nodeType: string,
  dynamicProperties: Record<string, any> = {},
  dynamicOutputs: Record<string, TypeMetadata> = {}
): Node<NodeData> => ({
  id,
  type: nodeType,
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

describe("Connection Validation Integration Tests", () => {
  describe("Static Node Connections", () => {
    it("should validate compatible static connections", () => {
      const textNode = createTestNode("text1", "text.processor");
      const dynamicNode = createTestNode("dynamic1", "dynamic.processor");

      // Find handles
      const sourceHandle = findOutputHandle(
        textNode,
        "processed_text",
        textProcessorMetadata
      );
      const targetHandle = findInputHandle(
        dynamicNode,
        "static_input",
        dynamicProcessorMetadata
      );

      expect(sourceHandle).toBeDefined();
      expect(targetHandle).toBeDefined();

      // Validate type compatibility
      const isCompatible = isConnectable(
        sourceHandle!.type,
        targetHandle!.type
      );
      expect(isCompatible).toBe(true);
    });

    it("should reject incompatible static connections", () => {
      const textNode = createTestNode("text1", "text.processor");
      const mathNode = createTestNode("math1", "math.calculator");

      // Try to connect word_count (int) to operand_a (float) - should work due to number compatibility
      const sourceHandle = findOutputHandle(
        textNode,
        "word_count",
        textProcessorMetadata
      );
      const targetHandle = findInputHandle(
        mathNode,
        "operand_a",
        mathCalculatorMetadata
      );

      expect(sourceHandle).toBeDefined();
      expect(targetHandle).toBeDefined();

      // This should actually work since int can be converted to float
      const isCompatible = isConnectable(
        sourceHandle!.type,
        targetHandle!.type
      );
      expect(isCompatible).toBe(false); // int != float in our strict type system
    });

    it("should reject connections to non-existent handles", () => {
      const textNode = createTestNode("text1", "text.processor");

      // Try to find non-existent handles
      const invalidOutput = findOutputHandle(
        textNode,
        "non_existent_output",
        textProcessorMetadata
      );
      const invalidInput = findInputHandle(
        textNode,
        "non_existent_input",
        textProcessorMetadata
      );

      expect(invalidOutput).toBeUndefined();
      expect(invalidInput).toBeUndefined();
    });
  });

  describe("Dynamic Node Connections", () => {
    it("should validate connections to dynamic properties", () => {
      const textNode = createTestNode("text1", "text.processor");
      const dynamicNode = createTestNode("dynamic1", "dynamic.processor", {
        custom_input: "some_value"
      });

      // Find handles
      const sourceHandle = findOutputHandle(
        textNode,
        "processed_text",
        textProcessorMetadata
      );
      const targetHandle = findInputHandle(
        dynamicNode,
        "custom_input",
        dynamicProcessorMetadata
      );

      expect(sourceHandle).toBeDefined();
      expect(targetHandle).toBeDefined();
      expect(targetHandle!.isDynamic).toBe(true);

      // Dynamic properties default to any type
      expect(targetHandle!.type.type).toBe("any");

      // Validate compatibility
      const isCompatible = isConnectable(
        sourceHandle!.type,
        targetHandle!.type
      );
      expect(isCompatible).toBe(true);
    });

    it("should validate connections from dynamic outputs", () => {
      const dynamicNode = createTestNode(
        "dynamic1",
        "dynamic.processor",
        {},
        {
          custom_output: boolType
        }
      );
      const textNode = createTestNode("text1", "text.processor");

      // Find handles
      const sourceHandle = findOutputHandle(
        dynamicNode,
        "custom_output",
        dynamicProcessorMetadata
      );
      const targetHandle = findInputHandle(
        textNode,
        "case_sensitive",
        textProcessorMetadata
      );

      expect(sourceHandle).toBeDefined();
      expect(targetHandle).toBeDefined();
      expect(sourceHandle!.isDynamic).toBe(true);

      // Validate compatibility (bool to bool)
      const isCompatible = isConnectable(
        sourceHandle!.type,
        targetHandle!.type
      );
      expect(isCompatible).toBe(true);
    });

    it("should reject connections to non-existent dynamic properties", () => {
      const textNode = createTestNode("text1", "text.processor");
      const dynamicNode = createTestNode("dynamic1", "dynamic.processor", {
        existing_prop: "value"
      });

      // Try to connect to a dynamic property that doesn't exist
      const sourceHandle = findOutputHandle(
        textNode,
        "processed_text",
        textProcessorMetadata
      );
      const targetHandle = findInputHandle(
        dynamicNode,
        "non_existent_prop",
        dynamicProcessorMetadata
      );

      expect(sourceHandle).toBeDefined();
      expect(targetHandle).toBeUndefined();
    });

    it("should reject dynamic properties on non-dynamic nodes", () => {
      const textNode = createTestNode("text1", "text.processor", {
        dynamic_prop: "value" // This shouldn't be recognized
      });

      // Non-dynamic node should not recognize dynamic properties
      const targetHandle = findInputHandle(
        textNode,
        "dynamic_prop",
        textProcessorMetadata
      );
      expect(targetHandle).toBeUndefined();
    });
  });

  describe("Complete Handle Discovery", () => {
    it("should discover all handles on static nodes", () => {
      const textNode = createTestNode("text1", "text.processor");

      const allOutputs = getAllOutputHandles(textNode, textProcessorMetadata);
      const allInputs = getAllInputHandles(textNode, textProcessorMetadata);

      expect(allOutputs).toHaveLength(2);
      expect(allOutputs.map((h) => h.name)).toEqual([
        "processed_text",
        "word_count"
      ]);
      expect(allOutputs.every((h) => !h.isDynamic)).toBe(true);

      expect(allInputs).toHaveLength(2);
      expect(allInputs.map((h) => h.name)).toEqual([
        "input_text",
        "case_sensitive"
      ]);
      expect(allInputs.every((h) => !h.isDynamic)).toBe(true);
    });

    it("should discover all handles on dynamic nodes with dynamic properties/outputs", () => {
      const dynamicNode = createTestNode(
        "dynamic1",
        "dynamic.processor",
        { dyn_prop1: "value1", dyn_prop2: "value2" },
        { dyn_out1: boolType, dyn_out2: intType }
      );

      const allOutputs = getAllOutputHandles(
        dynamicNode,
        dynamicProcessorMetadata
      );
      const allInputs = getAllInputHandles(
        dynamicNode,
        dynamicProcessorMetadata
      );

      // Should have 1 static + 2 dynamic outputs
      expect(allOutputs).toHaveLength(3);
      expect(allOutputs.filter((h) => !h.isDynamic)).toHaveLength(1);
      expect(allOutputs.filter((h) => h.isDynamic)).toHaveLength(2);
      expect(allOutputs.filter((h) => h.isDynamic).map((h) => h.name)).toEqual([
        "dyn_out1",
        "dyn_out2"
      ]);

      // Should have 1 static + 2 dynamic inputs
      expect(allInputs).toHaveLength(3);
      expect(allInputs.filter((h) => !h.isDynamic)).toHaveLength(1);
      expect(allInputs.filter((h) => h.isDynamic)).toHaveLength(2);
      expect(allInputs.filter((h) => h.isDynamic).map((h) => h.name)).toEqual([
        "dyn_prop1",
        "dyn_prop2"
      ]);
    });
  });

  describe("Type Compatibility Matrix", () => {
    const testCases = [
      { source: stringType, target: stringType, expected: true },
      { source: intType, target: intType, expected: true },
      { source: floatType, target: floatType, expected: true },
      { source: boolType, target: boolType, expected: true },
      { source: anyType, target: stringType, expected: true },
      { source: stringType, target: anyType, expected: true },
      { source: stringType, target: intType, expected: false },
      { source: intType, target: stringType, expected: false },
      { source: floatType, target: intType, expected: false },
      { source: boolType, target: stringType, expected: false }
    ];

    testCases.forEach(({ source, target, expected }) => {
      it(`should ${expected ? "allow" : "reject"} connection from ${
        source.type
      } to ${target.type}`, () => {
        const result = isConnectable(source, target);
        expect(result).toBe(expected);
      });
    });
  });

  describe("Edge Cases and Error Handling", () => {
    it("should handle nodes with missing dynamic_outputs gracefully", () => {
      const node = createTestNode("test1", "dynamic.processor");
      delete (node.data as any).dynamic_outputs;

      const allOutputs = getAllOutputHandles(node, dynamicProcessorMetadata);
      expect(allOutputs).toHaveLength(1); // Only static outputs
      expect(allOutputs[0].name).toBe("static_output");
    });

    it("should handle nodes with missing dynamic_properties gracefully", () => {
      const node = createTestNode("test1", "dynamic.processor");
      delete (node.data as any).dynamic_properties;

      const allInputs = getAllInputHandles(node, dynamicProcessorMetadata);
      expect(allInputs).toHaveLength(1); // Only static inputs
      expect(allInputs[0].name).toBe("static_input");
    });

    it("should handle empty dynamic properties and outputs", () => {
      const node = createTestNode("test1", "dynamic.processor", {}, {});

      const allOutputs = getAllOutputHandles(node, dynamicProcessorMetadata);
      const allInputs = getAllInputHandles(node, dynamicProcessorMetadata);

      expect(allOutputs).toHaveLength(1); // Only static
      expect(allInputs).toHaveLength(1); // Only static
    });

    it("should prioritize static handles over dynamic ones with same names", () => {
      const node = createTestNode(
        "test1",
        "dynamic.processor",
        { static_input: "dynamic_value" }, // Same name as static property
        { static_output: intType } // Same name as static output
      );

      const inputHandle = findInputHandle(
        node,
        "static_input",
        dynamicProcessorMetadata
      );
      const outputHandle = findOutputHandle(
        node,
        "static_output",
        dynamicProcessorMetadata
      );

      expect(inputHandle).toBeDefined();
      expect(outputHandle).toBeDefined();

      // Should return static handles, not dynamic ones
      expect(inputHandle!.isDynamic).toBe(false);
      expect(outputHandle!.isDynamic).toBe(false);
      expect(inputHandle!.type).toEqual(stringType);
      expect(outputHandle!.type).toEqual(stringType); // Static output type
    });
  });

  describe("Real-world Connection Scenarios", () => {
    it("should handle a complex workflow with mixed static and dynamic connections", () => {
      // Create a workflow: TextProcessor -> DynamicProcessor -> MathCalculator
      const textNode = createTestNode("text1", "text.processor");
      const dynamicNode = createTestNode(
        "dynamic1",
        "dynamic.processor",
        { text_input: "value", numeric_input: "value" },
        { processed_count: intType, processed_text: stringType }
      );
      const mathNode = createTestNode("math1", "math.calculator");

      // Connection 1: TextProcessor.processed_text -> DynamicProcessor.text_input (dynamic)
      const conn1Source = findOutputHandle(
        textNode,
        "processed_text",
        textProcessorMetadata
      );
      const conn1Target = findInputHandle(
        dynamicNode,
        "text_input",
        dynamicProcessorMetadata
      );

      expect(conn1Source).toBeDefined();
      expect(conn1Target).toBeDefined();
      expect(conn1Target!.isDynamic).toBe(true);
      expect(isConnectable(conn1Source!.type, conn1Target!.type)).toBe(true);

      // Connection 2: TextProcessor.word_count -> DynamicProcessor.numeric_input (dynamic)
      const conn2Source = findOutputHandle(
        textNode,
        "word_count",
        textProcessorMetadata
      );
      const conn2Target = findInputHandle(
        dynamicNode,
        "numeric_input",
        dynamicProcessorMetadata
      );

      expect(conn2Source).toBeDefined();
      expect(conn2Target).toBeDefined();
      expect(conn2Target!.isDynamic).toBe(true);
      // This should pass because dynamic properties use "any" type which is compatible with everything
      expect(isConnectable(conn2Source!.type, conn2Target!.type)).toBe(true);

      // Connection 3: DynamicProcessor.processed_count (dynamic) -> MathCalculator.operand_a
      const conn3Source = findOutputHandle(
        dynamicNode,
        "processed_count",
        dynamicProcessorMetadata
      );
      const conn3Target = findInputHandle(
        mathNode,
        "operand_a",
        mathCalculatorMetadata
      );

      expect(conn3Source).toBeDefined();
      expect(conn3Target).toBeDefined();
      expect(conn3Source!.isDynamic).toBe(true);
      // This should fail because int != float
      expect(isConnectable(conn3Source!.type, conn3Target!.type)).toBe(false);
    });

    it("should validate a complete connection workflow end-to-end", () => {
      // Simulate the complete validation process that would happen in the UI
      const sourceNode = createTestNode("source", "text.processor");
      const targetNode = createTestNode("target", "dynamic.processor", {
        text_prop: "value"
      });

      // 1. Find source handle
      const sourceHandle = findOutputHandle(
        sourceNode,
        "processed_text",
        textProcessorMetadata
      );
      expect(sourceHandle).toBeDefined();

      // 2. Find target handle
      const targetHandle = findInputHandle(
        targetNode,
        "text_prop",
        dynamicProcessorMetadata
      );
      expect(targetHandle).toBeDefined();

      // 3. Validate type compatibility
      const isCompatible = isConnectable(
        sourceHandle!.type,
        targetHandle!.type
      );
      expect(isCompatible).toBe(true);

      // 4. Simulate the complete connection validation that would happen in NodeStore
      const connectionIsValid =
        sourceHandle !== undefined &&
        targetHandle !== undefined &&
        isCompatible;

      expect(connectionIsValid).toBe(true);
    });
  });
});
