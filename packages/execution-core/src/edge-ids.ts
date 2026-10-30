/**
 * Build a synthetic, deterministic source_edge_id for a graph edge that does
 * not carry a saved id.
 */
export function syntheticEdgeId(
  sourceNodeId: string,
  sourceHandle: string,
  targetNodeId: string,
  targetHandle: string
): string {
  return `${sourceNodeId}:${sourceHandle}->${targetNodeId}:${targetHandle}`;
}

/**
 * Build a synthetic source_edge_id for values pushed in via the runner's
 * external input API.
 */
export function externalEdgeId(
  inputName: string,
  sourceHandle: string
): string {
  return `external:${inputName}:${sourceHandle}`;
}
