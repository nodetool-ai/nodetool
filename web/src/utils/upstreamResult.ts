import useResultsStore from "../stores/ResultsStore";
import useWorkflowRunsStore from "../stores/WorkflowRunsStore";
import { HYDRATED_JOB_ID } from "../stores/workflowResultHydration";

type RunsState = {
  getFocusedJob: (_workflowId: string) => string | undefined;
  getRuns: (_workflowId: string) => { jobId: string; startedAt: number }[];
};

type ResultsState = {
  getOutputResult: (_w: string, _j: string, _n: string) => unknown;
  getResult: (_w: string, _j: string, _n: string) => unknown;
};

/**
 * Canonical read for a node's stored value in a single run: the streamed /
 * accumulated output (`outputResults`, also where reopened-workflow assets are
 * hydrated) takes precedence over the `node_complete` envelope (`results`).
 *
 * This is the single source of the `outputResults ?? results` reconciliation —
 * readers go through it (or the across-runs resolvers below) rather than
 * reaching into the two buckets at the call site. Lives here, not in the store
 * module, so it survives a mocked ResultsStore in tests. Takes a store snapshot
 * so selectors can read it atomically.
 */
export const readNodeResult = (
  results: ResultsState,
  workflowId: string,
  jobId: string,
  nodeId: string
): unknown =>
  results.getOutputResult(workflowId, jobId, nodeId) ??
  results.getResult(workflowId, jobId, nodeId);

/**
 * Job ids to search for a node's value, in priority order: the focused run
 * (what the canvas shows), then the remaining runs newest-first, then the
 * synthetic hydrated run holding assets restored when the workflow was reopened.
 *
 * A node's value can live under any of these — the focused run, an earlier
 * per-node "Run Node" run, or the hydrated baseline — so both the run path and
 * the canvas display search them in this order rather than reading the focused
 * run alone. Pure over the runs-store snapshot, so reactive selectors can
 * `useShallow` the returned array.
 */
export const orderedRunJobIds = (
  runs: RunsState,
  workflowId: string
): string[] => {
  const ordered = [...runs.getRuns(workflowId)].sort(
    (a, b) => b.startedAt - a.startedAt
  );
  const jobIds: string[] = [];
  const push = (id: string | undefined) => {
    if (id && !jobIds.includes(id)) {
      jobIds.push(id);
    }
  };
  push(runs.getFocusedJob(workflowId));
  for (const run of ordered) {
    push(run.jobId);
  }
  push(HYDRATED_JOB_ID);
  return jobIds;
};

/**
 * A node's latest value across the given jobs (see {@link orderedRunJobIds}),
 * checking both result buckets via {@link readNodeResult}. Returns the first
 * job that holds a value, or `undefined`.
 */
export const resolveNodeResultAcrossRuns = (
  results: ResultsState,
  jobIds: string[],
  workflowId: string,
  nodeId: string
): unknown => {
  for (const jobId of jobIds) {
    const value = readNodeResult(results, workflowId, jobId, nodeId);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
};

/**
 * Like {@link resolveNodeResultAcrossRuns} but only the streaming/accumulated
 * output bucket (`getOutputResult`) — used where the envelope shape must not be
 * mixed in (e.g. an Output node rendering accumulated stream items).
 */
export const resolveNodeOutputAcrossRuns = (
  results: ResultsState,
  jobIds: string[],
  workflowId: string,
  nodeId: string
): unknown => {
  for (const jobId of jobIds) {
    const value = results.getOutputResult(workflowId, jobId, nodeId);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
};

/**
 * Build a getter for a node's latest stored value across the workflow's runs.
 *
 * "Run Node" feeds the node with previously-computed upstream values; this
 * resolves each upstream against {@link orderedRunJobIds} so a value produced by
 * any run (or restored on reopen) is found, instead of reporting the upstream as
 * "not executed yet" whenever some other run happens to be focused.
 */
export const makeUpstreamResultGetter = (
  workflowId: string
): ((_workflowId: string, _nodeId: string) => unknown) => {
  const jobIds = orderedRunJobIds(useWorkflowRunsStore.getState(), workflowId);
  return (_wf: string, nodeId: string): unknown =>
    resolveNodeResultAcrossRuns(
      useResultsStore.getState(),
      jobIds,
      workflowId,
      nodeId
    );
};
