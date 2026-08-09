import { z } from "zod";
import { uiGetGraphParams } from "@nodetool-ai/protocol";
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

FrontendToolRegistry.register({
  name: "ui_get_graph",
  description: "Read the current workflow graph (nodes and edges).",
  parameters: z.object(uiGetGraphParams),
  async execute({ workflow_id }, ctx) {
    const state = ctx.getState();
    const workflowId = resolveWorkflowId(state, workflow_id);
    const nodeStore = state.getNodeStore(workflowId)?.getState();
    if (!nodeStore) {
      throw new Error(`No node store for workflow ${workflowId}`);
    }

    const nodes = nodeStore.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data
    }));

    const edges = nodeStore.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle
    }));

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
      nodes,
      edges,
      validation
    };
  }
});
