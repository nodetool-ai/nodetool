/**
 * Trigger-driven subgraph execution for the app runtime.
 *
 * A UI event (slider move, input change) is a trigger: rather than re-running
 * the whole workflow, we execute only the subgraph downstream of the bound
 * input node. Every other input is seeded from its live UI value and every
 * external upstream from its cached last output, so the run is the minimal
 * recompute. It runs to completion and idles — no standing actors.
 *
 * This reuses the editor's live-preview primitive (`buildDownstreamRunGraph`)
 * and runs the browser-capable prefix in-browser via `runBrowserGraphJob`.
 */
import { Node as RFNode } from "@xyflow/react";

import { Workflow, WorkflowGraph } from "../../../stores/ApiTypes";
import { NodeData } from "../../../stores/NodeData";
import { graphNodeToReactFlowNode } from "../../../stores/graphNodeToReactFlowNode";
import { graphEdgeToReactFlowEdge } from "../../../stores/graphEdgeToReactFlowEdge";
import { reactFlowNodeToGraphNode } from "../../../stores/reactFlowNodeToGraphNode";
import { reactFlowEdgeToGraphEdge } from "../../../stores/reactFlowEdgeToGraphEdge";
import {
  browserRunnablePrefix,
  buildDownstreamRunGraph
} from "../../../hooks/nodes/buildDownstreamRunGraph";
import { browserSupportsSync } from "../../../lib/workflow/browserWorkflowRunner";
import { WorkflowIO } from "../workflowIO";
import {
  collectNodePropertyOverlays,
  parseNodePropertyBinding,
  withNodeProperties
} from "../nodeBinding";

export interface TriggerSubgraph {
  /** Browser-runnable graph in runner (graph-node) shape. */
  graph: WorkflowGraph;
  /** Ids of the nodes that will execute (for the job title / bookkeeping). */
  nodeIds: Set<string>;
}

/** Overlay a live UI value onto an input node's `value` property. */
const withInputValue = (
  node: RFNode<NodeData>,
  value: unknown
): RFNode<NodeData> => ({
  ...node,
  data: {
    ...node.data,
    properties: { ...(node.data?.properties ?? {}), value }
  }
});

/**
 * Build the browser-runnable downstream subgraph for a trigger, or null when
 * the trigger can't be resolved or nothing downstream runs in the browser
 * (the caller then falls back to a full run). The trigger is either a workflow
 * input name or a `node:<id>#<property>` binding — for the latter the bound
 * node itself is the subgraph root.
 */
export const buildTriggerSubgraph = (
  workflow: Workflow,
  io: WorkflowIO,
  values: Record<string, unknown>,
  triggerInputName: string
): TriggerSubgraph | null => {
  const nodeTrigger = parseNodePropertyBinding(triggerInputName);
  const trigger = nodeTrigger
    ? null
    : io.inputs.find((input) => input.name === triggerInputName);
  if (!nodeTrigger && !trigger) return null;
  const triggerNodeId = nodeTrigger?.nodeId ?? trigger!.nodeId;

  // Live UI values keyed by their input node id, so every input in/around the
  // subgraph reflects the current widget state — not the graph's saved default.
  const valueByNodeId = new Map<string, unknown>();
  for (const input of io.inputs) {
    const value = values[input.name];
    if (value !== undefined) valueByNodeId.set(input.nodeId, value);
  }
  // Node-property bindings overlay their live values the same way.
  const overlays = collectNodePropertyOverlays(values);

  const nodes = (workflow.graph?.nodes ?? []).map((node) => {
    let rf = graphNodeToReactFlowNode(workflow, node);
    if (valueByNodeId.has(rf.id)) {
      rf = withInputValue(rf, valueByNodeId.get(rf.id));
    }
    const overlay = overlays.get(rf.id);
    return overlay ? withNodeProperties(rf, overlay) : rf;
  });
  const edges = (workflow.graph?.edges ?? []).map(graphEdgeToReactFlowEdge);
  const findNode = (id: string) => nodes.find((node) => node.id === id);

  const built = buildDownstreamRunGraph({
    nodeId: triggerNodeId,
    nodes,
    edges,
    workflowId: workflow.id,
    findNode
  });
  if (!built || built.nodes.length === 0) return null;

  // Keep the maximal browser-runnable prefix so a server/Python tail doesn't
  // force a round-trip; the live previews still update client-side.
  const prefix = browserRunnablePrefix(
    { nodes: built.nodes, edges: built.edges },
    (type) => browserSupportsSync(type ?? "") === true
  );
  if (prefix.nodes.length === 0) return null;

  // The prefix must actually reach an output node, or there's nothing to show.
  // A graph whose compute is server-only (e.g. NLP nodes) trims down to just
  // the input node — return null so the caller falls back to a full run.
  const outputNodeIds = new Set(io.outputs.map((output) => output.nodeId));
  const prefixIds = new Set(prefix.nodes.map((node) => node.id));
  const reachesOutput = [...prefixIds].some((id) => outputNodeIds.has(id));
  if (!reachesOutput) return null;

  return {
    graph: {
      nodes: prefix.nodes.map(reactFlowNodeToGraphNode),
      edges: prefix.edges.map(reactFlowEdgeToGraphEdge)
    },
    nodeIds: new Set(prefix.nodes.map((node) => node.id))
  };
};
