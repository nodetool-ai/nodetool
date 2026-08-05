/**
 * One-shot `resume_job` handshake hint for reload-time run reconciliation.
 *
 * The socket's resume hint normally comes from scanning the runner stores
 * (`setResumeJobIdProvider` in workflowUpdates.ts), which only works for a run
 * the client still remembers. After a full page reload the stores are empty,
 * but run reconciliation (runReconciliation.ts) knows the job id it is about
 * to reattach before any connection exists. It parks the id here so the
 * handshake can carry `?resume_job=<id>` and a multi-instance server routes
 * the connection at the instance that owns the run's replay buffer.
 */
let pendingResumeJobId: string | null = null;

export const setPendingResumeJobId = (jobId: string | null): void => {
  pendingResumeJobId = jobId;
};

export const getPendingResumeJobId = (): string | null => pendingResumeJobId;
