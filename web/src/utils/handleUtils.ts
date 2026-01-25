import { Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import {
  NodeMetadata,
  OutputSlot,
  Property,
  TypeMetadata
} from "../stores/ApiTypes";

/**
 * Node types that output an enum-like type based on their instance properties.
 * These nodes store enum_type_name and options in their properties, and their
 * output should be treated as an enum for connectability purposes.
 */
const SELECT_NODE_TYPES = [
  "nodetool.input.SelectInput",
  "nodetool.constant.Select"
];

/**
 * Checks if a node type is a Select node (outputs enum-like type).
 */
export function isSelectNodeType(nodeType: string): boolean {
  return SELECT_NODE_TYPES.includes(nodeType);
}

/**
 * Gets the effective output type for a Select node based on its properties.
 * Returns an enum TypeMetadata with type_name and values from the node's properties.
 */
export function getSelectNodeEffectiveOutputType(
  node: Node<NodeData>
): TypeMetadata {
  const props = node.data.properties || {};
  const enumTypeName = (props.enum_type_name as string) || null;
  const options = (props.options as string[]) || [];

  return {
    type: "enum",
    optional: false,
    values: options.length > 0 ? options : null,
    type_args: [],
    type_name: enumTypeName
  };
}

/**
 * Represents an output handle (either static or dynamic)
 */
export interface OutputHandle {
  name: string;
  type: TypeMetadata;
  stream: boolean;
  isDynamic: boolean;
}

/**
 * Represents an input handle (either static or dynamic)
 */
export interface InputHandle {
  name: string;
  type: TypeMetadata;
  isDynamic: boolean;
}

/**
 * Finds an output handle by name on a node
 * Checks both static outputs (from metadata) and dynamic outputs (from node data)
 *
 * For Select nodes (SelectInput, Select), returns an effective enum type based
 * on the node's instance properties (enum_type_name, options) so that
 * connectability and highlighting work correctly.
 */
export function findOutputHandle(
  node: Node<NodeData>,
  handleName: string,
  metadata: NodeMetadata
): OutputHandle | undefined {
  // First check static outputs
  const staticOutput = metadata.outputs.find(
    (output: OutputSlot) => output.name === handleName
  );

  if (staticOutput) {
    // For Select nodes, return an effective enum type instead of the static "str" type
    if (handleName === "output" && isSelectNodeType(metadata.node_type)) {
      return {
        name: staticOutput.name,
        type: getSelectNodeEffectiveOutputType(node),
        stream: staticOutput.stream,
        isDynamic: false
      };
    }

    return {
      name: staticOutput.name,
      type: staticOutput.type,
      stream: staticOutput.stream,
      isDynamic: false
    };
  }

  // Then check dynamic outputs
  const dynamicOutputs = node.data.dynamic_outputs || {};
  const dynamicOutput = dynamicOutputs[handleName];

  if (dynamicOutput) {
    return {
      name: handleName,
      type: dynamicOutput,
      stream: false,
      isDynamic: true
    };
  }

  return undefined;
}

/**
 * Finds an input handle by name on a node
 * Checks both static properties (from metadata) and dynamic properties (from node data)
 */
export function findInputHandle(
  node: Node<NodeData>,
  handleName: string,
  metadata: NodeMetadata
): InputHandle | undefined {
  // First check static properties
  const staticProperty = metadata.properties.find(
    (property: Property) => property.name === handleName
  );

  if (staticProperty) {
    return {
      name: staticProperty.name,
      type: staticProperty.type,
      isDynamic: false
    };
  }

  if (metadata.is_dynamic) {
    const dynamicProperties = node.data.dynamic_properties || {};
    if (dynamicProperties[handleName] !== undefined) {
      return {
        name: handleName,
        type: {
          type: "any",
          optional: false,
          values: null,
          type_args: [],
          type_name: null
        },
        isDynamic: true
      };
    }
  }

  return undefined;
}

/**
 * Gets all output handles for a node (both static and dynamic)
 */
export function getAllOutputHandles(
  node: Node<NodeData>,
  metadata: NodeMetadata
): OutputHandle[] {
  const handles: OutputHandle[] = [];
  const isSelectNode = isSelectNodeType(metadata.node_type);

  // Add static outputs
  metadata.outputs.forEach((output: OutputSlot) => {
    // For Select nodes, return an effective enum type for the "output" handle
    const effectiveType =
      isSelectNode && output.name === "output"
        ? getSelectNodeEffectiveOutputType(node)
        : output.type;

    handles.push({
      name: output.name,
      type: effectiveType,
      stream: output.stream,
      isDynamic: false
    });
  });

  // Add dynamic outputs
  const dynamicOutputs = node.data.dynamic_outputs || {};
  Object.entries(dynamicOutputs).forEach(([name, type]) => {
    handles.push({
      name,
      type,
      stream: false,
      isDynamic: true
    });
  });

  return handles;
}

/**
 * Gets all input handles for a node (both static and dynamic)
 */
export function getAllInputHandles(
  node: Node<NodeData>,
  metadata: NodeMetadata
): InputHandle[] {
  const handles: InputHandle[] = [];

  // Add static properties
  metadata.properties.forEach((property: Property) => {
    handles.push({
      name: property.name,
      type: property.type,
      isDynamic: false
    });
  });

  // Add dynamic properties (for dynamic nodes)
  if (metadata.is_dynamic) {
    const dynamicProperties = node.data.dynamic_properties || {};
    Object.keys(dynamicProperties).forEach((name) => {
      handles.push({
        name,
        type: {
          type: "any", // Dynamic properties take on the type of their incoming connection
          optional: false,
          values: null,
          type_args: [],
          type_name: null
        },
        isDynamic: true
      });
    });
  }

  return handles;
}

/**
 * Validates if an output handle exists on a node
 */
export function hasOutputHandle(
  node: Node<NodeData>,
  handleName: string,
  metadata: NodeMetadata
): boolean {
  return findOutputHandle(node, handleName, metadata) !== undefined;
}

/**
 * Validates if an input handle exists on a node
 */
export function hasInputHandle(
  node: Node<NodeData>,
  handleName: string,
  metadata: NodeMetadata
): boolean {
  return findInputHandle(node, handleName, metadata) !== undefined;
}
