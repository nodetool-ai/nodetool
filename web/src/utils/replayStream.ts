import { Node, Edge } from "@xyflow/react";
import { NodeData } from "../stores/NodeData";

const FOR_EACH_NODE_TYPE = "nodetool.control.ForEach";

/**
 * Stable, collision-free id for the synthetic ForEach replay node that feeds
 * (targetId, targetHandle) the values a pruned multi-select source (sourceId,
 * sourceHandle) would have emitted. Deterministic in all four coordinates so a
 * re-run of the same partial graph reuses the same id (no duplicate nodes) and
 * two different replays into the same target never collide.
 */
const replayNodeId = (
  sourceId: string,
  sourceHandle: string | null | undefined,
  targetId: string,
  targetHandle: string
): string =>
  `replay:${sourceId}:${sourceHandle ?? ""}->${targetId}:${targetHandle}`;

/**
 * Build the synthetic `nodetool.control.ForEach` replay node + edge that streams
 * a multi-select set into one downstream handle. The ForEach's `input_list` is
 * the selected (pick-ordered, completed, num_images-flattened) value list, so
 * `genProcess` yields each item with iteration correlation — the downstream
 * receives N iteration-correlated emissions, identical to a live generation of
 * those N items. `input_list`-as-property binds to the node instance exactly as
 * today's static property overrides do, so no edge into the ForEach is needed.
 *
 * The node mirrors the minimal shape `reactFlowNodeToGraphNode` / the run graph
 * expects (id, type, position, data.{properties, dynamic_properties,
 * workflow_id}); the edge wires the ForEach `output` handle to the target.
 */
export const buildReplayForEach = (args: {
  sourceId: string;
  sourceHandle: string | null | undefined;
  targetId: string;
  targetHandle: string;
  values: unknown[];
  workflowId: string;
}): { node: Node<NodeData>; edge: Edge } => {
  const { sourceId, sourceHandle, targetId, targetHandle, values, workflowId } =
    args;
  const replayId = replayNodeId(sourceId, sourceHandle, targetId, targetHandle);

  const node: Node<NodeData> = {
    id: replayId,
    type: FOR_EACH_NODE_TYPE,
    position: { x: 0, y: 0 },
    data: {
      properties: { input_list: values, limit: -1 },
      dynamic_properties: {},
      selectable: true,
      workflow_id: workflowId
    }
  };

  const edge: Edge = {
    id: `${replayId}->${targetId}:${targetHandle}`,
    source: replayId,
    sourceHandle: "output",
    target: targetId,
    targetHandle
  };

  return { node, edge };
};
