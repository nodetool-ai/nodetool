import { z } from "zod";
import { uiGetGraphParams } from "@nodetool-ai/protocol";
import type { Node as GraphNode, Edge as GraphEdge } from "../../../stores/ApiTypes";
import { fetchWorkflowById } from "../../../serverState/useWorkflow";
import { FrontendToolRegistry } from "../frontendTools";
import { resolveWorkflowId } from "./workflow";
import { COMMENT_NODE_TYPE, GROUP_NODE_TYPE } from "../../../constants/nodeTypes";
import {
  inferInputKeysFromCode,
  parsesAsCodeBody
} from "../../../utils/codeOutputInference";

/**
 * Node types that are not expected to have incoming edges.
 * These are excluded from the "orphaned node" check.
 */
const INPUT_OR_STRUCTURAL_PREFIXES = [
  "nodetool.input.",
  "nodetool.constant.",
  COMMENT_NODE_TYPE,
  GROUP_NODE_TYPE
];

function isInputOrStructural(nodeType: string | undefined): boolean {
  if (!nodeType) {return false;}
  return INPUT_OR_STRUCTURAL_PREFIXES.some((prefix) =>
    nodeType.startsWith(prefix)
  );
}

/**
 * Node types that are not expected to have outgoing edges.
 * These are excluded from the "orphaned node" check.
 */
const OUTPUT_PREFIXES = ["nodetool.output."];

function isOutputNode(nodeType: string | undefined): boolean {
  if (!nodeType) {return false;}
  return OUTPUT_PREFIXES.some((prefix) => nodeType.startsWith(prefix));
}

interface ValidationResult {
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

const CODE_NODE_TYPE = "nodetool.code.Code";

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Check a Code node's body: it is the one property whose mistakes are only
 * found by running the workflow. A body that does not parse, or that reads a
 * name the node has no input for, throws the moment the node executes.
 * `inferInputKeysFromCode` returns exactly the names that resolve against
 * neither the sandbox nor the code's own bindings.
 */
function validateCodeNode(
  node: { id: string; data: Record<string, unknown> },
  nodeLabel: string,
  connectedInputs: Set<string>,
  errors: string[]
): void {
  const properties = asRecord(node.data?.properties);
  const code = properties.code ?? node.data?.code;
  if (typeof code !== "string" || code.trim() === "") {return;}
  if (connectedInputs.has(`${node.id}::code`)) {return;}

  if (!parsesAsCodeBody(code)) {
    errors.push(
      `Node ${nodeLabel}: the code does not parse as JavaScript.`
    );
    return;
  }

  const available = new Set([
    ...Object.keys(asRecord(node.data?.dynamic_properties)),
    ...Object.keys(asRecord(node.data?.dynamic_inputs))
  ]);
  // Reads off the `inputs` object that no slot or edge feeds. A bare undefined
  // name (`lodash`) is not decidable here — that needs the sandbox global list,
  // which lives in node-sdk's validator; `validate_workflow` and the run-time
  // graph check report those.
  const undefinedNames = (inferInputKeysFromCode(code) ?? []).filter(
    (name) =>
      !available.has(name) && !connectedInputs.has(`${node.id}::${name}`)
  );
  if (undefinedNames.length > 0) {
    errors.push(
      `Node ${nodeLabel}: the code reads ${undefinedNames
        .map((name) => `"inputs.${name}"`)
        .join(", ")}, which ${undefinedNames.length > 1 ? "are" : "is"} not an input of this node.`
    );
  }
}

function validateGraph(
  nodes: Array<{
    id: string;
    type: string | undefined;
    data: Record<string, unknown>;
  }>,
  edges: Array<{
    source: string;
    target: string;
    sourceHandle: string | null | undefined;
    targetHandle: string | null | undefined;
  }>,
  nodeMetadata: Record<string, unknown>
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  const connectedInputs = new Set<string>();
  const nodesWithIncoming = new Set<string>();
  const nodesWithOutgoing = new Set<string>();

  for (const edge of edges) {
    if (edge.targetHandle) {
      connectedInputs.add(`${edge.target}::${edge.targetHandle}`);
    }
    nodesWithIncoming.add(edge.target);
    nodesWithOutgoing.add(edge.source);
  }

  for (const node of nodes) {
    const nodeType = node.type;
    if (!nodeType) {continue;}

    const nodeLabel = `${nodeType} (${node.id})`;

    if (nodeType === CODE_NODE_TYPE) {
      validateCodeNode(node, nodeLabel, connectedInputs, errors);
    }

    const meta = (nodeMetadata as Record<string, { properties?: Array<{ name: string; required: boolean; type: { type: string; optional: boolean }; default?: unknown }> }>)[nodeType];
    if (!meta || !meta.properties) {continue;}

    for (const prop of meta.properties) {
      if (!prop.required) {continue;}

      const isConnected = connectedInputs.has(`${node.id}::${prop.name}`);

      // Check for required inputs not connected and not set
      if (!isConnected) {
        const value = node.data?.[prop.name];
        const hasValue = value !== undefined && value !== null && value !== "";

        if (!hasValue) {
          errors.push(
            `Node ${nodeLabel}: required property "${prop.name}" is not connected and has no value set.`
          );
        }
      }
    }

    // Check for orphaned nodes (no incoming AND no outgoing edges)
    if (
      !isInputOrStructural(nodeType) &&
      !isOutputNode(nodeType) &&
      !nodesWithIncoming.has(node.id) &&
      !nodesWithOutgoing.has(node.id)
    ) {
      suggestions.push(
        `Node ${nodeLabel} has no connections. Consider connecting it or removing it.`
      );
    }
  }

  return { errors, warnings, suggestions };
}

interface ReadNode {
  id: string;
  type: string | undefined;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

interface ReadEdge {
  id: string | null | undefined;
  source: string;
  target: string;
  sourceHandle: string | null | undefined;
  targetHandle: string | null | undefined;
}

/**
 * Map a stored graph node onto the shape an open editor reports. The stored
 * node keeps the property bag flat under `data` and the position under
 * `ui_properties`; the editor nests properties one level down. The validation
 * below and every agent that reads this tool expect the editor's shape, so a
 * server-sourced read must speak it too. Editor-only concerns (size, colour,
 * collapsed state) are left out: this is a read of the graph, not a render.
 */
function storedNodeToReadNode(node: GraphNode): ReadNode {
  const ui =
    node.ui_properties !== null && typeof node.ui_properties === "object"
      ? (node.ui_properties as Record<string, unknown>)
      : {};
  const position =
    ui.position !== null && typeof ui.position === "object"
      ? (ui.position as { x: number; y: number })
      : { x: 0, y: 0 };
  return {
    id: node.id,
    type: node.type,
    position,
    data: {
      properties: asRecord(node.data),
      dynamic_properties: node.dynamic_properties ?? {},
      dynamic_inputs: node.dynamic_inputs ?? {},
      dynamic_outputs: node.dynamic_outputs ?? {},
      title: typeof ui.title === "string" ? ui.title : undefined
    }
  };
}

function storedEdgeToReadEdge(edge: GraphEdge): ReadEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle
  };
}

FrontendToolRegistry.register({
  name: "ui_get_graph",
  description:
    "Read a workflow graph (nodes and edges). Reads the open editor when the " +
    "workflow has one, otherwise the saved workflow from the server — so a " +
    "workflow created over the API is readable without opening it. " +
    "`source` says which one answered.",
  parameters: z.object(uiGetGraphParams),
  async execute({ workflow_id }, ctx) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const nodeStore = state.getNodeStore(workflowId)?.getState();

    let nodes: ReadNode[];
    let edges: ReadEdge[];
    let source: "editor" | "server";

    if (nodeStore) {
      source = "editor";
      nodes = nodeStore.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: node.data as unknown as Record<string, unknown>
      }));
      edges = nodeStore.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle
      }));
    } else {
      // A workflow the agent just created over the API has no editor. Failing
      // here once cost a session a full rebuild of the workflow, so read the
      // saved row instead.
      source = "server";
      let workflow = state.getWorkflow(workflowId);
      if (!workflow) {
        try {
          workflow = await fetchWorkflowById(workflowId);
        } catch (error) {
          throw new Error(
            `Cannot read workflow ${workflowId}: no editor is open for it and ` +
              `the server did not return it (${
                error instanceof Error ? error.message : String(error)
              }).`
          );
        }
      }
      nodes = (workflow.graph?.nodes ?? []).map(storedNodeToReadNode);
      edges = (workflow.graph?.edges ?? []).map(storedEdgeToReadEdge);
    }

    let validation: ValidationResult = {
      errors: [],
      warnings: [],
      suggestions: []
    };

    try {
      validation = validateGraph(nodes, edges, state.nodeMetadata);
    } catch {
      // Validation is best-effort; don't fail the response
    }

    return {
      ok: true,
      workflow_id: workflowId,
      source,
      nodes,
      edges,
      validation
    };
  }
});
