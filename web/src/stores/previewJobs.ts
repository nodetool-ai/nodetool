/**
 * Silent (live-preview) job registry.
 *
 * The image-adjustment sliders re-run their downstream subgraph in the browser
 * on every move (see `useLiveSliderWriter`). Those runs exist only to refresh
 * the preview image — they must NOT drive any per-node run-state visual (the
 * running ring, the "Completed in …" timing badge, or the ambient-liveness ring
 * that marks a node active in a non-focused run). Otherwise every scrub frame
 * flashes those indicators.
 *
 * `workflowUpdates` consults this set: for a silent job it still upserts the
 * live generation (so the picture updates) but skips per-node status, timing
 * and job-list churn. A plain module-level Set — `handleUpdate` is a hot,
 * non-reactive message handler, so a getter beats a store subscription.
 */
const silentJobs = new Set<string>();

export const markJobSilent = (jobId: string): void => {
  silentJobs.add(jobId);
};

export const unmarkJobSilent = (jobId: string): void => {
  silentJobs.delete(jobId);
};

export const isSilentJob = (jobId: string | null | undefined): boolean =>
  !!jobId && silentJobs.has(jobId);
