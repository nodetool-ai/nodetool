import { Node } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";
import {
  NodeMetadata,
  OutputSlot,
  Property,
  TypeMetadata
} from "../stores/ApiTypes";
import { inferOutputType } from "./outputTypeInference";

/**
 * Represents an output handle (either static or dynamic)
 */
interface OutputHandle {
  name: string;
  type: TypeMetadata;
  stream: boolean;
  isDynamic: boolean;
}

/**
 * Represents an input handle (either static or dynamic)
 */
interface InputHandle {
  name: string;
  type: TypeMetadata;
  isDynamic: boolean;
}

/**
 * Finds an output handle by name on a node
 * Checks both static outputs (from metadata) and dynamic outputs (from node data)
 *
 * For nodes whose effective output type is instance-dependent (Select, Get
 * Variable, Asset Collection, …) the type is resolved through the
 * output-type-inference registry so connectability and highlighting work
 * correctly. See `outputTypeInference.ts`.
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
    const inferred = inferOutputType(
      metadata.node_type,
      node,
      handleName,
      staticOutput
    );
    if (inferred) {
      return {
        name: staticOutput.name,
        type: inferred.type,
        stream: inferred.stream ?? staticOutput.stream,
        isDynamic: inferred.isDynamic
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

  // Image Editor / sketch: per-layer handles (`layer_in_*`) live in dynamic_inputs
  // while API metadata may omit supports_dynamic_inputs.
  const earlyDynamicInputs = node.data.dynamic_inputs || {};
  if (earlyDynamicInputs[handleName] !== undefined) {
    const inputMeta = earlyDynamicInputs[handleName];
    const type = inputMeta
      ? {
          type: inputMeta.type,
          optional: inputMeta.optional ?? false,
          values: inputMeta.values ?? null,
          type_args: inputMeta.type_args ?? [],
          type_name: inputMeta.type_name ?? null
        }
      : {
          type: "any",
          optional: false,
          values: null,
          type_args: [],
          type_name: null
        };
    return {
      name: handleName,
      type,
      isDynamic: true
    };
  }

  // Dynamic property handles (instance values). NodeInputs renders an input
  // handle for every entry in `dynamic_properties`, so they must resolve here
  // too — both for `supports_dynamic_inputs` nodes (e.g. Format Text) and for nodes that
  // carry instance dynamic_properties without the metadata flag (e.g. the
  // Agent node's `{{variable}}` template inputs). Without this, edges to those
  // rendered handles are dropped by sanitizeGraph on load. A name that exists
  // only as a dynamic OUTPUT is not an input handle.
  const dynamicProperties = node.data.dynamic_properties || {};
  const dynamicOutputs = node.data.dynamic_outputs || {};
  if (
    dynamicProperties[handleName] !== undefined &&
    dynamicOutputs[handleName] === undefined
  ) {
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

  // Add static outputs, resolving instance-dependent types via the registry.
  metadata.outputs.forEach((output: OutputSlot) => {
    const inferred = inferOutputType(
      metadata.node_type,
      node,
      output.name,
      output
    );
    handles.push({
      name: output.name,
      type: inferred?.type ?? output.type,
      stream: inferred?.stream ?? output.stream,
      isDynamic: inferred?.isDynamic ?? false
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

  // Add dynamic handles. These come from schema metadata (`dynamic_inputs`,
  // e.g. Image Editor `layer_in_*`) and from instance values
  // (`dynamic_properties`, e.g. Agent `{{variable}}` template inputs). Both are
  // recognized regardless of the `supports_dynamic_inputs` metadata flag so they stay
  // consistent with what NodeInputs renders. A name that exists only as a
  // dynamic OUTPUT is not an input handle.
  const dynamicInputs = node.data.dynamic_inputs || {};
  const dynamicProperties = node.data.dynamic_properties || {};
  const dynamicOutputs = node.data.dynamic_outputs || {};
  const dynamicHandleNames = new Set([
    ...Object.keys(dynamicInputs),
    ...Object.keys(dynamicProperties)
  ]);

  dynamicHandleNames.forEach((name) => {
    if (handles.some((h) => h.name === name)) {
      return;
    }
    const isDynamicOutputOnly =
      dynamicOutputs[name] !== undefined && dynamicInputs[name] === undefined;
    if (isDynamicOutputOnly) {
      return;
    }
    const inputMeta = dynamicInputs[name];
    const type = inputMeta
      ? {
          type: inputMeta.type,
          optional: inputMeta.optional ?? false,
          values: inputMeta.values ?? null,
          type_args: inputMeta.type_args ?? [],
          type_name: inputMeta.type_name ?? null
        }
      : {
          type: "any",
          optional: false,
          values: null,
          type_args: [],
          type_name: null
        };
    handles.push({
      name,
      type,
      isDynamic: true
    });
  });

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
