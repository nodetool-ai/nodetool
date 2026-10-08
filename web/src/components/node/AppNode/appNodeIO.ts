import {
  isScriptOperation,
  type ApplicationDocument,
  type OperationBinding
} from "@nodetool-ai/app-runtime";
import type { OutputCorrelation } from "@nodetool-ai/protocol";
import type { TypeMetadata } from "../../../stores/ApiTypes";
import type { DynamicSlotDeclaration } from "../../../stores/NodeData";
import { isObjectLike, isString } from "../../../utils/typePredicates";
import { INPUT_TYPE_MAP, OUTPUT_TYPE_MAP } from "../WorkflowNode/WorkflowLoader.helpers";

const INPUT_PREFIX = "nodetool.input.";
const OUTPUT_PREFIX = "nodetool.output.";

/** An operation the App node can run: one that runs a workflow, not a script. */
export const workflowOperations = (
  document: ApplicationDocument
): OperationBinding[] =>
  document.operations.filter(
    (operation) => !isScriptOperation(operation) && operation.workflowId !== ""
  );

/** The slice of a workflow this reads; a full `Workflow` satisfies it. */
export interface AppWorkflowSource {
  id: string;
  graph?: {
    nodes?: readonly unknown[] | null;
    edges?: readonly unknown[] | null;
  } | null;
}

/** What the App node stores in its `app_json` property. */
export interface AppSnapshot {
  name: string;
  operation_id: string;
  workflow_id: string;
  graph: unknown;
  /** Input values the app fixes itself, keyed by input name. */
  constants: Record<string, unknown>;
}

export interface AppNodeIO {
  app_json: AppSnapshot;
  dynamic_inputs: Record<string, DynamicSlotDeclaration>;
  dynamic_outputs: Record<string, TypeMetadata>;
  dynamic_properties: Record<string, unknown>;
  /** A `chunk` entry for every output the app's workflow streams. */
  dynamic_output_correlation: Record<string, OutputCorrelation>;
}

/** What the App node reads from node metadata. */
export interface AppNodeMetadataLookup {
  /** The type an Input node type emits, so image and list inputs get typed handles. */
  inputType: (nodeType: string) => TypeMetadata | undefined;
  /** The correlation a node type declares for one of its outputs. */
  outputCorrelation: (
    nodeType: string,
    handle: string
  ) => OutputCorrelation | undefined;
}

const STREAMED: OutputCorrelation = { kind: "chunk", source: "__execution__" };

const anyType = (type: string): TypeMetadata => ({
  type,
  optional: false,
  type_args: []
});

interface GraphNodeView {
  id: string;
  type: string;
  properties: Record<string, unknown>;
  title?: string;
  dynamicCorrelation: Record<string, unknown>;
}

interface GraphEdgeView {
  source: string;
  sourceHandle: string;
  target: string;
}

/**
 * API workflow nodes keep their properties in `data`; editor nodes nest them
 * under `data.properties`. Read both.
 */
const viewNode = (node: unknown): GraphNodeView | null => {
  if (!isObjectLike(node) || !isString(node.id) || !isString(node.type)) {
    return null;
  }
  const data = isObjectLike(node.data) ? node.data : {};
  const properties = isObjectLike(data.properties) ? data.properties : data;
  return {
    id: node.id,
    type: node.type,
    properties,
    title: isString(data.title) ? data.title : undefined,
    dynamicCorrelation: isObjectLike(node.dynamic_output_correlation)
      ? node.dynamic_output_correlation
      : {}
  };
};

const viewEdge = (edge: unknown): GraphEdgeView | null => {
  if (
    !isObjectLike(edge) ||
    !isString(edge.source) ||
    !isString(edge.sourceHandle) ||
    !isString(edge.target) ||
    edge.edge_type === "control" ||
    edge.type === "control"
  ) {
    return null;
  }
  return {
    source: edge.source,
    sourceHandle: edge.sourceHandle,
    target: edge.target
  };
};

/**
 * Whether a node can emit more than once per run: some upstream output on a
 * path into it iterates or streams, and no aggregate (Collect) on that path
 * folds the stream back into one value. Mirrors the kernel's correlation
 * analysis closely enough to pick a port's kind; the kernel still checks the
 * outer graph.
 */
const makeStreamCheck = (
  nodes: ReadonlyMap<string, GraphNodeView>,
  edges: readonly GraphEdgeView[],
  outputCorrelation: AppNodeMetadataLookup["outputCorrelation"]
): ((nodeId: string) => boolean) => {
  const memo = new Map<string, boolean>();
  const kindOf = (nodeId: string, handle: string): string | undefined => {
    const node = nodes.get(nodeId);
    if (!node) {
      return undefined;
    }
    const declared = outputCorrelation(node.type, handle);
    if (declared) {
      return declared.kind;
    }
    const dynamic = node.dynamicCorrelation[handle];
    return isObjectLike(dynamic) && isString(dynamic.kind)
      ? dynamic.kind
      : undefined;
  };
  const streams = (nodeId: string): boolean => {
    const known = memo.get(nodeId);
    if (known !== undefined) {
      return known;
    }
    // A cycle reached again counts as not streaming; Loop edges close cycles.
    memo.set(nodeId, false);
    let result = false;
    for (const edge of edges) {
      if (edge.target !== nodeId) {
        continue;
      }
      const kind = kindOf(edge.source, edge.sourceHandle);
      if (kind === "iteration" || kind === "chunk") {
        result = true;
      } else if (kind !== "aggregate") {
        result = streams(edge.source);
      }
      if (result) {
        break;
      }
    }
    memo.set(nodeId, result);
    return result;
  };
  return streams;
};

/** The name the run protocol keys an Input or Output node by. */
const portName = (node: GraphNodeView): string => {
  const name = node.properties.name;
  if (isString(name) && name.trim()) {
    return name.trim();
  }
  // Matches the Workflow node's fallback and the title the server hydrates an
  // unnamed node with ("Output" for nodetool.output.Output).
  return node.title?.trim() || node.type.split(".").pop() || node.id;
};

/**
 * Derive the App node's ports from an app operation and its workflow.
 *
 * Every Input node of the workflow is an input of the app, except the ones the
 * operation fixes to a constant: those go into `constants` and never become a
 * port. An input the app reads from a variable or a resource stays a port, and
 * a variable's declared default seeds it. Every Output node is an output.
 *
 * An output whose Output node can emit more than once per run (it sits
 * behind a For Each, a streaming model, or a streaming nested app) is marked
 * `chunk`, so each value reaches downstream nodes as it arrives.
 */
export const extractAppNodeIO = (
  appName: string,
  document: ApplicationDocument,
  operation: OperationBinding,
  workflow: AppWorkflowSource,
  lookup: AppNodeMetadataLookup
): AppNodeIO => {
  const rawNodes = workflow.graph?.nodes ?? [];
  const nodes = rawNodes
    .map(viewNode)
    .filter((node): node is GraphNodeView => node !== null);
  const edges = (workflow.graph?.edges ?? [])
    .map(viewEdge)
    .filter((edge): edge is GraphEdgeView => edge !== null);
  const streams = makeStreamCheck(
    new Map(nodes.map((node) => [node.id, node])),
    edges,
    lookup.outputCorrelation
  );

  const dynamic_inputs: Record<string, DynamicSlotDeclaration> = {};
  const dynamic_outputs: Record<string, TypeMetadata> = {};
  const dynamic_properties: Record<string, unknown> = {};
  const constants: Record<string, unknown> = {};
  const dynamic_output_correlation: Record<string, OutputCorrelation> = {};

  for (const node of nodes) {
    if (node.type.startsWith(INPUT_PREFIX)) {
      const name = portName(node);
      const mapping = operation.inputs[node.id] ?? { from: "widget" as const };
      if (mapping.from === "constant") {
        constants[name] = mapping.value;
        continue;
      }
      const type =
        lookup.inputType(node.type) ?? anyType(INPUT_TYPE_MAP[node.type] ?? "any");
      dynamic_inputs[name] = {
        type: { ...type, optional: true },
        description: isString(node.properties.description)
          ? node.properties.description
          : ""
      };
      const variableDefault =
        mapping.from === "variable"
          ? document.variables.find(
              (variable) => variable.id === mapping.variableId
            )?.default
          : undefined;
      dynamic_properties[name] =
        variableDefault ?? node.properties.value ?? null;
    } else if (node.type.startsWith(OUTPUT_PREFIX)) {
      const name = portName(node);
      dynamic_outputs[name] = anyType(OUTPUT_TYPE_MAP[node.type] ?? "any");
      if (streams(node.id)) {
        dynamic_output_correlation[name] = STREAMED;
      }
    }
  }

  return {
    app_json: {
      name: appName,
      operation_id: operation.id,
      workflow_id: workflow.id,
      graph: workflow.graph ?? null,
      constants
    },
    dynamic_inputs,
    dynamic_outputs,
    dynamic_properties,
    dynamic_output_correlation
  };
};
