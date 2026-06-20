import type {
  Asset,
  GenerationComplete,
  JobUpdate,
  NodeUpdate,
  WorkflowAttributes
} from "../ApiTypes";
import useResultsStore from "../ResultsStore";
import { handleUpdate } from "../workflowUpdates";
import { markJobSilent, unmarkJobSilent } from "../previewJobs";
import {
  assetToGeneration,
  mergeGenerations,
  groupByRun
} from "../../utils/nodeGenerations";

const mockAddNotification = jest.fn();
const mockDequeueNextPendingRun = jest.fn();

const mockRunnerStore = {
  getState: () => ({
    job_id: "job-1",
    state: "running",
    addNotification: mockAddNotification,
    dequeueNextPendingRun: mockDequeueNextPendingRun
  }),
  setState: jest.fn(),
  subscribe: jest.fn()
};

const mockWorkflow = {
  id: "workflow-1",
  name: "Workflow 1"
} as WorkflowAttributes;

beforeEach(() => {
  useResultsStore.setState({ liveGenerations: {} } as never);
  mockRunnerStore.setState.mockClear();
  mockAddNotification.mockClear();
  mockDequeueNextPendingRun.mockClear();
});

describe("handleUpdate live generations", () => {
  it("creates one finalized generation from running -> completed node_update", () => {
    const running = {
      type: "node_update",
      node_id: "n1",
      node_name: "Node 1",
      node_type: "test.Node",
      status: "running",
      job_id: "j1"
    } as unknown as NodeUpdate;

    const completed = {
      type: "node_update",
      node_id: "n1",
      node_name: "Node 1",
      node_type: "test.Node",
      status: "completed",
      result: { output: 7 },
      provider_cost: undefined,
      job_id: "j1"
    } as unknown as NodeUpdate;

    handleUpdate(mockWorkflow, running, mockRunnerStore as never, () => undefined);
    handleUpdate(
      mockWorkflow,
      completed,
      mockRunnerStore as never,
      () => undefined
    );

    const list = useResultsStore
      .getState()
      .getLiveGenerations("workflow-1", "n1");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      jobId: "j1",
      status: "completed",
      outputs: { output: 7 }
    });
  });

  it("records an error generation on a failed node_update", () => {
    const errored = {
      type: "node_update",
      node_id: "n1",
      node_name: "Node 1",
      node_type: "test.Node",
      status: "error",
      error: "boom",
      job_id: "j1"
    } as unknown as NodeUpdate;

    handleUpdate(mockWorkflow, errored, mockRunnerStore as never, () => undefined);

    const list = useResultsStore
      .getState()
      .getLiveGenerations("workflow-1", "n1");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      jobId: "j1",
      status: "error",
      error: "boom"
    });
  });
});

const dispatch = (data: unknown) =>
  handleUpdate(
    mockWorkflow,
    data as never,
    mockRunnerStore as never,
    () => undefined
  );

const genComplete = (
  jobId: string,
  index: number,
  output: unknown,
  nodeId = "n4"
): GenerationComplete =>
  ({
    type: "generation_complete",
    node_id: nodeId,
    node_name: "TextToImage",
    node_type: "image.TextToImage",
    index,
    outputs: { output },
    job_id: jobId
  }) as unknown as GenerationComplete;

const nodeUpdate = (
  status: string,
  jobId: string,
  extra: Record<string, unknown> = {},
  nodeId = "n4"
): NodeUpdate =>
  ({
    type: "node_update",
    node_id: nodeId,
    node_name: "TextToImage",
    node_type: "image.TextToImage",
    status,
    job_id: jobId,
    ...extra
  }) as unknown as NodeUpdate;

const gens = (nodeId = "n4") =>
  useResultsStore.getState().getLiveGenerations("workflow-1", nodeId);

describe("handleUpdate — generation_complete drives liveGenerations", () => {
  it("6× generation_complete (index 0-5) on one jobId → 6 live generations", () => {
    for (let i = 0; i < 6; i++) {
      dispatch(genComplete("j1", i, `img${i}`));
    }
    const list = gens();
    expect(list).toHaveLength(6);
    expect(list.map((g) => g.id)).toEqual([
      "j1",
      "j1#1",
      "j1#2",
      "j1#3",
      "j1#4",
      "j1#5"
    ]);
    expect(list.every((g) => g.jobId === "j1")).toBe(true);
    expect(list.every((g) => g.status === "completed")).toBe(true);
    expect(list.map((g) => g.outputs.output)).toEqual([
      "img0",
      "img1",
      "img2",
      "img3",
      "img4",
      "img5"
    ]);
  });

  it("a later run with a new jobId starts a distinct group, leaving the old run intact", () => {
    for (let i = 0; i < 6; i++) {
      dispatch(genComplete("j1", i, `img${i}`));
    }
    dispatch(genComplete("j2", 0, "newimg"));
    const list = gens();
    expect(list).toHaveLength(7);
    expect(list.slice(0, 6).every((g) => g.jobId === "j1")).toBe(true);
    expect(list[6]).toMatchObject({
      id: "j2",
      jobId: "j2",
      status: "completed",
      outputs: { output: "newimg" }
    });
  });

  it("running placeholder then generation_complete{index:0} settles ONE variant", () => {
    dispatch(nodeUpdate("running", "j1"));
    expect(gens()).toHaveLength(1);
    dispatch(genComplete("j1", 0, "img0"));
    const list = gens();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: "j1",
      jobId: "j1",
      status: "completed",
      outputs: { output: "img0" }
    });
  });
});

describe("handleUpdate — node_update{completed} fallback", () => {
  // Distinct jobIds per case: the saw-generation_complete set is module-level
  // (cleared per-run via job_update in production), so cases that must NOT see a
  // prior gen_complete flag use a fresh jobId rather than relying on cross-test
  // reset.
  it("with NO prior generation_complete → one synthesized generation (object result)", () => {
    dispatch(nodeUpdate("completed", "fb-obj", { result: { output: 7 } }));
    const list = gens();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      jobId: "fb-obj",
      status: "completed",
      outputs: { output: 7 }
    });
  });

  it("with NO prior generation_complete → scalar result coerces to {output: raw}", () => {
    dispatch(nodeUpdate("completed", "fb-scalar", { result: "hello" }));
    const list = gens();
    expect(list).toHaveLength(1);
    expect(list[0].outputs).toEqual({ output: "hello" });
  });

  it("AFTER generation_completes → fallback does NOT fire (no phantom variant)", () => {
    dispatch(genComplete("fb-after", 0, "img0"));
    dispatch(genComplete("fb-after", 1, "img1"));
    dispatch(
      nodeUpdate("completed", "fb-after", { result: { output: "collapsed" } })
    );
    const list = gens();
    // Still exactly the two committed variants — no synthesized third.
    expect(list).toHaveLength(2);
    expect(list.map((g) => g.outputs.output)).toEqual(["img0", "img1"]);
  });

  it("node_update{error} after a running placeholder settles newest slot, no phantom", () => {
    dispatch(nodeUpdate("running", "fb-err"));
    dispatch(nodeUpdate("error", "fb-err", { error: "boom" }));
    const list = gens();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: "fb-err",
      jobId: "fb-err",
      status: "error",
      error: "boom"
    });
  });

  it("clears the saw-flag on a reused jobId so the next run's fallback fires", () => {
    // jobId === the mock runner's job_id so the job_update is the runner's own
    // run (isRunnerJob) and reaches the per-run saw-flag clear.
    const jobId = "job-1";
    // Run 1: generation_complete lands → fallback suppressed.
    dispatch(genComplete(jobId, 0, "img0"));
    dispatch(nodeUpdate("completed", jobId, { result: { output: "collapsed" } }));
    expect(gens()).toHaveLength(1);

    // A fresh run reuses the same jobId — job_update{running} must clear the flag.
    useResultsStore.setState({ liveGenerations: {} } as never);
    dispatch({
      type: "job_update",
      status: "running",
      job_id: jobId
    } as unknown as JobUpdate);

    // Run 2: no generation_complete this time → fallback DOES synthesize.
    dispatch(nodeUpdate("completed", jobId, { result: { output: "synth" } }));
    const list = gens();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      jobId,
      status: "completed",
      outputs: { output: "synth" }
    });
  });
});

describe("handleUpdate — silent (scrub) generation_complete", () => {
  it("8 scrub frames (running + generation_complete) under one silent jobId → 1 live gen", () => {
    markJobSilent("scrub-job");
    try {
      for (let frame = 1; frame <= 8; frame++) {
        dispatch(nodeUpdate("running", "scrub-job"));
        dispatch(genComplete("scrub-job", frame - 1, `frame-${frame}`));
      }
      const list = gens();
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        id: "scrub-job",
        jobId: "scrub-job",
        status: "completed",
        outputs: { output: "frame-8" }
      });
    } finally {
      unmarkJobSilent("scrub-job");
    }
  });

  it("running placeholder for a silent job stays slot 0", () => {
    markJobSilent("scrub-2");
    try {
      dispatch(nodeUpdate("running", "scrub-2"));
      dispatch(nodeUpdate("running", "scrub-2"));
      const list = gens();
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ id: "scrub-2", status: "running" });
    } finally {
      unmarkJobSilent("scrub-2");
    }
  });
});

// Build a persisted image Asset whose created_at orders it within its job.
const persistedAsset = (
  id: string,
  jobId: string,
  createdAt: string
): Asset =>
  ({
    id,
    job_id: jobId,
    node_id: "n4",
    content_type: "image/png",
    get_url: `http://x/${id}.png`,
    created_at: createdAt
  }) as unknown as Asset;

// The real integration seam (Finding 3): drive N generation_complete through
// the actual handleUpdate reducer + ResultsStore, read the live generations the
// store actually produced (NOT hand-rolled ids), then feed THOSE through
// mergeGenerations alongside the persisted assets the server's autosave cutover
// would create. This locks the live-id contract between ResultsStore and
// liveIndexOf — the conjunction the layer-isolated tests only assumed.
describe("end-to-end: handleUpdate live → mergeGenerations → groupByRun", () => {
  it("6 generation_complete (real reducer) + 6 persisted (same job) → ONE run, 6 variants", () => {
    // Drive 6 generation_complete through the real reducer.
    for (let i = 0; i < 6; i++) {
      dispatch(genComplete("j1", i, `img${i}`));
    }
    const live = gens();
    expect(live).toHaveLength(6);
    // Sanity: the store minted the ids liveIndexOf relies on.
    expect(live.map((g) => g.id)).toEqual([
      "j1",
      "j1#1",
      "j1#2",
      "j1#3",
      "j1#4",
      "j1#5"
    ]);

    // The 6 assets the autosave cutover persists for this run.
    const persisted = Array.from({ length: 6 }, (_, i) =>
      assetToGeneration(persistedAsset(`a${i}`, "j1", `2026-01-01T00:00:0${i}.000Z`))
    );

    // Reconcile the REAL live array (not hand-rolled) with the persisted twins.
    const merged = mergeGenerations(persisted, live);
    const runs = groupByRun(merged);
    expect(runs).toHaveLength(1);
    expect(runs[0].variants).toHaveLength(6);
    // Every slot superseded by its persisted twin — no live leftovers, no loss.
    expect(merged.map((g) => g.id)).toEqual([
      "a0",
      "a1",
      "a2",
      "a3",
      "a4",
      "a5"
    ]);
  });

  it("mid-run: 6 live (real reducer) + only 1 persisted → still ONE run, 6 variants", () => {
    for (let i = 0; i < 6; i++) {
      dispatch(genComplete("j1", i, `img${i}`));
    }
    const live = gens();
    expect(live).toHaveLength(6);

    // Only slot 0 has persisted so far (the handoff is mid-flight).
    const persisted = [
      assetToGeneration(persistedAsset("a0", "j1", "2026-01-01T00:00:00.000Z"))
    ];
    const merged = mergeGenerations(persisted, live);
    const runs = groupByRun(merged);
    expect(runs).toHaveLength(1);
    expect(runs[0].variants).toHaveLength(6);
    // Slot 0 is the persisted a0; slots 1..5 survive as the real live variants.
    expect(merged.map((g) => g.id)).toEqual([
      "a0",
      "j1#1",
      "j1#2",
      "j1#3",
      "j1#4",
      "j1#5"
    ]);
  });

  it("regression lock: the real 6 live do NOT collapse to 1 when one asset persists", () => {
    for (let i = 0; i < 6; i++) {
      dispatch(genComplete("j1", i, `img${i}`));
    }
    const live = gens();
    const persisted = [
      assetToGeneration(persistedAsset("a0", "j1", "2026-01-01T00:00:00.000Z"))
    ];
    const merged = mergeGenerations(persisted, live);
    // The OLD drop-all-live-for-job behavior would collapse to exactly 1 (["a0"]).
    expect(merged).not.toHaveLength(1);
    expect(groupByRun(merged)[0].variants).toHaveLength(6);
  });
});
