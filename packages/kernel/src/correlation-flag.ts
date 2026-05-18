/**
 * Feature flag for correlation-aware scheduling and envelope propagation.
 *
 * Read at observation time (not cached) so tests can toggle via
 * process.env.NODETOOL_USE_CORRELATION without re-importing modules.
 *
 * Per docs/correlation-design.md the rollout is:
 *   PR 2 — envelope propagation behind this flag (old scheduler still active)
 *   PR 3 — correlated buffered scheduler behind this flag
 *   PR 4 — stream nodes migrated, joins added
 *   PR 5 — flag flips on by default
 */

const TRUTHY = new Set(["1", "true", "yes", "on"]);

export function isCorrelationEnabled(): boolean {
  const raw = process.env.NODETOOL_USE_CORRELATION;
  if (!raw) return false;
  return TRUTHY.has(raw.trim().toLowerCase());
}

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
