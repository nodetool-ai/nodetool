import type { Edge } from "@xyflow/react";

/**
 * React Flow caches handle positions for edges. After a node’s height changes
 * (collapse / expand), `updateNodeInternals` must run after layout has committed.
 * Double `requestAnimationFrame` alone is not always enough with React 18 + MUI;
 * we schedule an extra pass on the next macrotask so DOM measurements match.
 */
export function scheduleNodeInternalsRefresh(
  updateNodeInternals: (nodeId: string | string[]) => void,
  nodeIdOrIds: string | string[]
): void {
  const run = (): void => {
    updateNodeInternals(nodeIdOrIds);
  };
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      run();
      setTimeout(run, 0);
      requestAnimationFrame(() => {
        run();
      });
      setTimeout(run, 24);
      setTimeout(run, 72);
      setTimeout(run, 160);
    });
  });
}

/** Refresh both endpoints without propagating layout work beyond direct neighbors. */
export function withEdgeNeighborNodeIds(
  nodeIds: readonly string[],
  edges: readonly Edge[]
): string[] {
  const changed = new Set(nodeIds);
  const result = new Set(nodeIds);
  for (const edge of edges) {
    if (!edge.source || !edge.target) {
      continue;
    }
    if (changed.has(edge.source)) {
      result.add(edge.target);
    }
    if (changed.has(edge.target)) {
      result.add(edge.source);
    }
  }
  return [...result];
}
