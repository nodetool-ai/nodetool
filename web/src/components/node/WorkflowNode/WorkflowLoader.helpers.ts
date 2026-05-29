import type { TypeMetadata, Workflow } from "../../../stores/ApiTypes";

/** Map input node types to TypeMetadata types */
export const INPUT_TYPE_MAP: Record<string, string> = {
  "nodetool.input.StringInput": "str",
  "nodetool.input.IntegerInput": "int",
  "nodetool.input.FloatInput": "float",
  "nodetool.input.BooleanInput": "bool",
  "nodetool.input.ImageInput": "image",
  "nodetool.input.AudioInput": "audio",
  "nodetool.input.VideoInput": "video",
  "nodetool.input.TextInput": "str"
};

/** Map output node types to TypeMetadata types */
export const OUTPUT_TYPE_MAP: Record<string, string> = {
  "nodetool.output.StringOutput": "str",
  "nodetool.output.IntegerOutput": "int",
  "nodetool.output.FloatOutput": "float",
  "nodetool.output.BooleanOutput": "bool",
  "nodetool.output.ImageOutput": "image",
  "nodetool.output.AudioOutput": "audio",
  "nodetool.output.VideoOutput": "video",
  "nodetool.output.TextOutput": "str",
  "nodetool.output.Output": "any"
};

/**
 * Extract dynamic inputs and outputs from a workflow's input/output nodes.
 * Input nodes become dynamic inputs; Output nodes become dynamic outputs.
 */
interface DynamicIO {
  dynamic_inputs: Record<string, TypeMetadata & { description?: string }>;
  dynamic_outputs: Record<string, TypeMetadata>;
  dynamic_properties: Record<string, unknown>;
}

export function extractDynamicIO(workflow: Workflow): DynamicIO {
  const graph = workflow.graph;
  if (!graph || !graph.nodes) {
    return { dynamic_inputs: {}, dynamic_outputs: {}, dynamic_properties: {} };
  }

  const nodes = Array.isArray(graph.nodes)
    ? graph.nodes
    : Object.values(graph.nodes);

  const dynamic_inputs: Record<
    string,
    TypeMetadata & { description?: string }
  > = {};
  const dynamic_outputs: Record<string, TypeMetadata> = {};
  const dynamic_properties: Record<string, unknown> = {};

  for (const node of nodes) {
    const nodeType = (node as { type?: string }).type ?? "";
    const nodeData = (node as { data?: Record<string, unknown> }).data ?? {};
    // API workflow nodes store properties directly in node.data (e.g. node.data.name),
    // while ReactFlow nodes nest them under node.data.properties.
    const nested = nodeData.properties as Record<string, unknown> | undefined;
    const properties = (nested && typeof nested === "object") ? nested : nodeData;
    const typeNameFallback = nodeType.split(".").pop() ?? "input";
    const inputName =
      (properties.name as string | undefined) ??
      (nodeData.title as string | undefined) ??
      typeNameFallback;

    if (INPUT_TYPE_MAP[nodeType]) {
      const resolvedType = INPUT_TYPE_MAP[nodeType];
      dynamic_inputs[inputName] = {
        type: resolvedType,
        optional: true,
        type_args: [] as TypeMetadata[],
        description: (properties.description as string) ?? ""
      };
      dynamic_properties[inputName] = properties.value ?? "";
    }

    if (OUTPUT_TYPE_MAP[nodeType]) {
      const resolvedType = OUTPUT_TYPE_MAP[nodeType];
      const outputName =
        (properties.name as string | undefined) ??
        (nodeData.title as string | undefined) ??
        typeNameFallback;
      dynamic_outputs[outputName] = {
        type: resolvedType,
        optional: false,
        type_args: [] as TypeMetadata[]
      };
    }
  }

  return { dynamic_inputs, dynamic_outputs, dynamic_properties };
}
