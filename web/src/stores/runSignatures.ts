/**
 * Dispatch-time input-signature registry, keyed by jobId.
 *
 * See docs/superpowers/specs/2026-06-27-run-subgraph-caching.md §3.4 (Stamping).
 * At dispatch the run path computes each node's `inputSignature` against the
 * LIVE FULL graph and stashes the map here under the run's jobId. `handleUpdate`
 * (workflowUpdates.ts) reads it back to stamp each produced generation, so the
 * Computed cache key matches a later `resolve` / `buildRunSubgraph` lookup.
 *
 * Plain in-memory: the cache it feeds is in-memory too (spec §8). The caller
 * clears a job's entry on job end.
 */

const signaturesByJob = new Map<string, Record<string, string>>();

/** Stash the signature map (nodeId → inputSignature) for one dispatched run. */
export const recordRunSignatures = (
  jobId: string,
  signatures: Record<string, string>
): void => {
  signaturesByJob.set(jobId, signatures);
};

/** The stamped input signature for a node in a run, or undefined if unknown. */
export const getRunSignature = (
  jobId: string,
  nodeId: string
): string | undefined => signaturesByJob.get(jobId)?.[nodeId];

/** Drop a finished run's signatures. */
export const clearRunSignatures = (jobId: string): void => {
  signaturesByJob.delete(jobId);
};
