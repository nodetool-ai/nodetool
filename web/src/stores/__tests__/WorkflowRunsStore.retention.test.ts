/**
 * Run retention: a long session keeps at most MAX_RETAINED_RUNS_PER_WORKFLOW
 * finished runs per workflow, plus the focused (or pinned) run and every run
 * still in flight. An evicted run's job-keyed slices leave the run-state stores.
 */
import useWorkflowRunsStore, {
  MAX_RETAINED_RUNS_PER_WORKFLOW,
  type RunMeta
} from "../WorkflowRunsStore";
import useResultsStore from "../ResultsStore";
import useStatusStore from "../StatusStore";
import useErrorStore from "../ErrorStore";
import useExecutionTimeStore from "../ExecutionTimeStore";
import { edgeKey } from "../nodeKey";

const wf = "wf";

const meta = (i: number, overrides: Partial<RunMeta> = {}): RunMeta => ({
  jobId: `job-${i}`,
  workflowId: wf,
  state: "completed",
  startedAt: i,
  ...overrides
});

/** Give a run a slice in every job-keyed run-state store. */
const seedSlices = (jobId: string) => {
  useResultsStore.getState().setOutputResult(wf, jobId, "n", "out");
  useResultsStore.getState().setProgress(wf, jobId, "n", 1, 2);
  useResultsStore.getState().setEdge(wf, jobId, "e", "done");
  useResultsStore.getState().addChunk(wf, jobId, "n", "text");
  useStatusStore.getState().setStatus(wf, jobId, "n", "completed");
  useErrorStore.getState().setError(wf, jobId, "n", "boom");
  useExecutionTimeStore.getState().startExecution(wf, jobId, "n");
};

const hasSlices = (jobId: string): boolean[] => [
  useResultsStore.getState().getOutputResult(wf, jobId, "n") !== undefined,
  useResultsStore.getState().getProgress(wf, jobId, "n") !== undefined,
  useResultsStore.getState().edges[edgeKey(wf, jobId, "e")] !== undefined,
  useResultsStore.getState().getChunk(wf, jobId, "n") !== undefined,
  useStatusStore.getState().getStatus(wf, jobId, "n") !== undefined,
  useErrorStore.getState().getError(wf, jobId, "n") !== undefined,
  useExecutionTimeStore.getState().getTiming(wf, jobId, "n") !== undefined
];

const jobIds = () =>
  useWorkflowRunsStore
    .getState()
    .getRuns(wf)
    .map((r) => r.jobId);

beforeEach(() => {
  useWorkflowRunsStore.setState({ runs: {}, focusedJob: {}, pinned: {} });
  useResultsStore.setState({
    outputResults: {},
    progress: {},
    edges: {},
    chunks: {}
  });
  useStatusStore.setState({ statuses: {} });
  useErrorStore.setState({ errors: {} });
  useExecutionTimeStore.setState({ timings: {} });
});

describe("WorkflowRunsStore retention", () => {
  it("keeps only the newest finished runs and drops the oldest one's slices", () => {
    const { recordRun } = useWorkflowRunsStore.getState();
    for (let i = 0; i < MAX_RETAINED_RUNS_PER_WORKFLOW; i++) {
      recordRun(meta(i));
      seedSlices(`job-${i}`);
    }
    expect(jobIds()).toHaveLength(MAX_RETAINED_RUNS_PER_WORKFLOW);

    recordRun(meta(MAX_RETAINED_RUNS_PER_WORKFLOW));

    expect(jobIds()).toHaveLength(MAX_RETAINED_RUNS_PER_WORKFLOW);
    expect(jobIds()).not.toContain("job-0");
    expect(hasSlices("job-0")).toEqual(new Array(7).fill(false));
    expect(hasSlices("job-1")).toEqual(new Array(7).fill(true));
  });

  it("never evicts a run still in flight", () => {
    const { recordRun } = useWorkflowRunsStore.getState();
    recordRun(meta(0, { state: "running" }));
    for (let i = 1; i <= MAX_RETAINED_RUNS_PER_WORKFLOW; i++) {
      recordRun(meta(i));
    }

    expect(jobIds()).toContain("job-0");
    expect(jobIds()).not.toContain("job-1");
  });

  it("keeps a pinned run however old it is", () => {
    const { recordRun, setFocusedJob } = useWorkflowRunsStore.getState();
    recordRun(meta(0));
    setFocusedJob(wf, "job-0");
    seedSlices("job-0");
    for (let i = 1; i <= MAX_RETAINED_RUNS_PER_WORKFLOW + 5; i++) {
      recordRun(meta(i));
    }

    expect(jobIds()).toContain("job-0");
    expect(hasSlices("job-0")).toEqual(new Array(7).fill(true));
    expect(jobIds()).toHaveLength(MAX_RETAINED_RUNS_PER_WORKFLOW);
  });

  it("drops a removed run's slices but not a sibling's", () => {
    const { recordRun, removeRun } = useWorkflowRunsStore.getState();
    recordRun(meta(0));
    recordRun(meta(1));
    seedSlices("job-0");
    seedSlices("job-1");

    removeRun(wf, "job-0");

    expect(hasSlices("job-0")).toEqual(new Array(7).fill(false));
    expect(hasSlices("job-1")).toEqual(new Array(7).fill(true));
  });
});
