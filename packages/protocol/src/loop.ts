/**
 * Workflow loops: the one definition of a loop back edge.
 *
 * A workflow graph may contain a cycle only when the cycle closes on a
 * feedback input of a `Loop` node. The kernel, the editor, and the graph
 * building tools all decide "is this edge allowed to close a cycle?" through
 * these helpers so they never disagree. Design: docs/workflow-loops.md.
 */

/** Node type of the loop node. */
export const LOOP_NODE_TYPE = "nodetool.control.Loop";

/** Loop input handles that are wired from the loop body (back edges). */
export const LOOP_FEEDBACK_HANDLES: readonly string[] = ["next", "condition"];

/** Iteration group the loop's `value` and `index` outputs share. */
export const LOOP_ITERATION_GROUP = "loop";

/** Correlation root the loop mints for its iterations. */
export function loopRootId(loopNodeId: string): string {
  return `${loopNodeId}:${LOOP_ITERATION_GROUP}`;
}

/** Minimal edge shape the cycle helpers read. */
export interface LoopEdgeLike {
  source: string;
  target: string;
  targetHandle?: string | null;
  edge_type?: string;
}

/** True when `handle` on a node of `nodeType` is a loop feedback input. */
export function isLoopFeedbackHandle(
  nodeType: string | null | undefined,
  handle: string | null | undefined
): boolean {
  return (
    nodeType === LOOP_NODE_TYPE &&
    LOOP_FEEDBACK_HANDLES.some((feedback) => feedback === handle)
  );
}

/**
 * True when `edge` is a loop back edge: a data edge into a feedback input of a
 * `Loop` node. `nodeTypeOf` resolves a node id to its type.
 */
export function isLoopBackEdge(
  edge: LoopEdgeLike,
  nodeTypeOf: (nodeId: string) => string | null | undefined
): boolean {
  if (edge.edge_type === "control") return false;
  return isLoopFeedbackHandle(nodeTypeOf(edge.target), edge.targetHandle);
}

/**
 * True when adding `source → target.targetHandle` to `edges` closes a cycle
 * that no loop back edge breaks. Back edges (existing ones and the new one)
 * are ignored, so the check asks whether the graph without back edges stays
 * acyclic. A self-loop is always rejected.
 */
export function wouldCreateLoopUnsafeCycle(
  edges: Iterable<LoopEdgeLike>,
  source: string,
  target: string,
  targetHandle: string | null | undefined,
  nodeTypeOf: (nodeId: string) => string | null | undefined
): boolean {
  if (source === target) return true;
  if (isLoopFeedbackHandle(nodeTypeOf(target), targetHandle)) return false;
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    if (isLoopBackEdge(edge, nodeTypeOf)) continue;
    const list = outgoing.get(edge.source);
    if (list) list.push(edge.target);
    else outgoing.set(edge.source, [edge.target]);
  }
  const pending = [target];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const nodeId = pending.pop()!;
    if (nodeId === source) return true;
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);
    const next = outgoing.get(nodeId);
    if (next) pending.push(...next);
  }
  return false;
}
