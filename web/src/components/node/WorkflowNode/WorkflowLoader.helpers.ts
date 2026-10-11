import { WORKFLOW_NODE_TYPE } from "../../../constants/nodeTypes";
import type { TypeMetadata } from "../../../stores/ApiTypes";
import useMetadataStore from "../../../stores/MetadataStore";
import type { DynamicSlotDeclaration } from "../../../stores/NodeData";
import { isObjectLike, isString } from "../../../utils/typePredicates";

const INPUT_PREFIX = "nodetool.input.";

/**
 * Fallback types for input nodes whose metadata is not loaded. Ports come
 * from every named `nodetool.input.*` node, typed from its metadata output.
 */
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
  dynamic_inputs: Record<string, DynamicSlotDeclaration>;
  dynamic_outputs: Record<string, TypeMetadata>;
  dynamic_properties: Record<string, unknown>;
}

/**
 * The slice of a workflow this reads. A full `Workflow` satisfies it, and so
 * does a SubgraphNode's inline `graph` property, which is stored untyped.
 * Nodes stay `unknown`: an API node keeps its properties on `data` while a
 * ReactFlow node nests them under `data.properties`, and the loop narrows both.
 */
export interface DynamicIOSource {
  graph?: {
    nodes?: readonly unknown[] | Record<string, unknown> | null;
  } | null;
}

export function extractDynamicIO(workflow: DynamicIOSource): DynamicIO {
  const graph = workflow.graph;
  if (!graph || !graph.nodes) {
    return { dynamic_inputs: {}, dynamic_outputs: {}, dynamic_properties: {} };
  }

  const nodes = Array.isArray(graph.nodes)
    ? graph.nodes
    : Object.values(graph.nodes);

  const dynamic_inputs: Record<string, DynamicSlotDeclaration> = {};
  const dynamic_outputs: Record<string, TypeMetadata> = {};
  const dynamic_properties: Record<string, unknown> = {};

  for (const node of nodes) {
    const nodeType = (node as { type?: string }).type ?? "";
    const nodeData = (node as { data?: Record<string, unknown> }).data ?? {};
    // API workflow nodes store properties directly in node.data (e.g. node.data.name),
    // while ReactFlow nodes nest them under node.data.properties.
    const nested = nodeData.properties as Record<string, unknown> | undefined;
    const properties = (nested && isObjectLike(nested)) ? nested : nodeData;
    const typeNameFallback = nodeType.split(".").pop() ?? "input";
    const inputName =
      (properties.name as string | undefined) ??
      (nodeData.title as string | undefined) ??
      typeNameFallback;

    // An input node is any `nodetool.input.*` node with a `name`, which is
    // the parameter key the sub-workflow run matches. The mapped types keep
    // their type-name fallback for nodes saved without a name.
    const isInput =
      nodeType.startsWith(INPUT_PREFIX) &&
      (INPUT_TYPE_MAP[nodeType] !== undefined || isString(properties.name)) &&
      inputName !== "";
    if (isInput) {
      const metadataType = useMetadataStore.getState().getMetadata(nodeType)
        ?.outputs[0]?.type;
      dynamic_inputs[inputName] = {
        type: metadataType
          ? { ...metadataType, optional: true }
          : {
              type: INPUT_TYPE_MAP[nodeType] ?? "any",
              optional: true,
              values: null,
              type_args: [] as TypeMetadata[],
              type_name: null
            },
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

type GraphSource = DynamicIOSource["graph"];

/** The workflows a graph's Workflow nodes run, with the copy each one stores. */
const workflowNodeRefs = (
  graph: GraphSource
): Array<{ id: string; graph: GraphSource }> => {
  if (!graph?.nodes) {
    return [];
  }
  const nodes = Array.isArray(graph.nodes)
    ? graph.nodes
    : Object.values(graph.nodes);
  const refs: Array<{ id: string; graph: GraphSource }> = [];
  for (const node of nodes) {
    if (!isObjectLike(node) || node.type !== WORKFLOW_NODE_TYPE) {
      continue;
    }
    const data = isObjectLike(node.data) ? node.data : {};
    const properties = isObjectLike(data.properties) ? data.properties : data;
    const json = isObjectLike(properties.workflow_json)
      ? properties.workflow_json
      : {};
    const id = isString(properties.workflow_id) && properties.workflow_id !== ""
      ? properties.workflow_id
      : json.id;
    if (isString(id)) {
      refs.push({
        id,
        graph: isObjectLike(json.graph) ? (json.graph as GraphSource) : null
      });
    }
  }
  return refs;
};

/**
 * Whether running `workflow` from a Workflow node in `hostId` would reach
 * `hostId` again. Follows each nested Workflow node through its stored copy
 * and, for open workflows, through `liveGraph`.
 */
export function createsWorkflowCycle(
  hostId: string,
  workflow: { id: string } & DynamicIOSource,
  liveGraph: (workflowId: string) => GraphSource | undefined
): boolean {
  if (workflow.id === hostId) {
    return true;
  }
  // Stored copies are finite trees. A live graph is rebuilt on every call,
  // so each open workflow is expanded once.
  const expanded = new Set<string>([workflow.id]);
  const pending: GraphSource[] = [workflow.graph];
  while (pending.length > 0) {
    const graph = pending.pop();
    for (const ref of workflowNodeRefs(graph)) {
      if (ref.id === hostId) {
        return true;
      }
      pending.push(ref.graph);
      if (!expanded.has(ref.id)) {
        expanded.add(ref.id);
        pending.push(liveGraph(ref.id));
      }
    }
  }
  return false;
}
