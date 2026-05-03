import { z } from "zod";
import { uiGetGraphParams } from "@nodetool-ai/protocol";
import { FrontendToolRegistry } from "../frontendTools";
import { resolveWorkflowId } from "./workflow";

/**
 * Node types that are not expected to have incoming edges.
 * These are excluded from the "orphaned node" check.
 */
const INPUT_OR_STRUCTURAL_PREFIXES = [
  "nodetool.input.",
  "nodetool.constant.",
  "nodetool.workflows.base_node.Comment",
  "nodetool.workflows.base_node.Group"
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

  // Build a set of connected (target, targetHandle) pairs for fast lookup
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

    // Look up metadata for this node type
    const meta = (nodeMetadata as Record<string, { properties?: Array<{ name: string; required: boolean; type: { type: string; optional: boolean }; default?: unknown }> }>)[nodeType];
    if (!meta || !meta.properties) {continue;}

    const nodeLabel = `${nodeType} (${node.id})`;

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
