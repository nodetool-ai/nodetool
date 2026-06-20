import useResultsStore from "../ResultsStore";

const reset = () =>
  useResultsStore.setState({ liveGenerations: {} } as never);

const live = (workflowId: string, nodeId: string) =>
  useResultsStore.getState().getLiveGenerations(workflowId, nodeId);

describe("ResultsStore.upsertLiveGeneration — dumb index-keyed upsert", () => {
  beforeEach(reset);

  it("index 0,1,2 on one jobId yields three variants with stable ids and outputs", () => {
    const s = useResultsStore.getState();
    s.upsertLiveGeneration("wf", "n", "j1", {
      index: 0,
      status: "completed",
      outputs: { output: "img0" }
    });
    s.upsertLiveGeneration("wf", "n", "j1", {
      index: 1,
      status: "completed",
      outputs: { output: "img1" }
    });
    s.upsertLiveGeneration("wf", "n", "j1", {
      index: 2,
      status: "completed",
      outputs: { output: "img2" }
    });
    const list = live("wf", "n");
    expect(list).toHaveLength(3);
    expect(list.map((g) => g.id)).toEqual(["j1", "j1#1", "j1#2"]);
    expect(list.map((g) => g.jobId)).toEqual(["j1", "j1", "j1"]);
    expect(list.map((g) => g.outputs.output)).toEqual([
      "img0",
      "img1",
      "img2"
    ]);
    expect(list.every((g) => g.status === "completed")).toBe(true);
    // The routing-only index must not leak onto the stored Generation.
    expect(list.every((g) => !("index" in g))).toBe(true);
  });

  it("index-less running then index:0 completed settles ONE variant in place", () => {
    const s = useResultsStore.getState();
    s.upsertLiveGeneration("wf", "n", "j1", {
      createdAt: 1,
      status: "running",
      outputs: {}
    });
    expect(live("wf", "n")).toHaveLength(1);
    s.upsertLiveGeneration("wf", "n", "j1", {
      index: 0,
      status: "completed",
      outputs: { output: "img0" }
    });
    const list = live("wf", "n");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: "j1",
      jobId: "j1",
      status: "completed",
      outputs: { output: "img0" }
    });
  });

  it("index-less running with no slot creates slot 0 (id===jobId, running)", () => {
    const s = useResultsStore.getState();
    s.upsertLiveGeneration("wf", "n", "j1", {
      createdAt: 1,
      status: "running",
      outputs: {}
    });
    const list = live("wf", "n");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: "j1",
      jobId: "j1",
      status: "running"
    });
  });

  it("index:2 with no prior slots creates exactly the jobId#2 slot (sparse, no backfill)", () => {
    const s = useResultsStore.getState();
    s.upsertLiveGeneration("wf", "n", "j1", {
      index: 2,
      status: "completed",
      outputs: { output: "img2" }
    });
    const list = live("wf", "n");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: "j1#2",
      jobId: "j1",
      status: "completed",
      outputs: { output: "img2" }
    });
  });

  it("re-upserting an existing index merges in place (same id, stable createdAt)", () => {
    const s = useResultsStore.getState();
    s.upsertLiveGeneration("wf", "n", "j1", {
      index: 1,
      createdAt: 100,
      status: "running",
      outputs: {}
    });
    s.upsertLiveGeneration("wf", "n", "j1", {
      index: 1,
      status: "completed",
      outputs: { output: "imgA" }
    });
    const list = live("wf", "n");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: "j1#1",
      jobId: "j1",
      createdAt: 100,
      status: "completed",
      outputs: { output: "imgA" }
    });
  });

  it("index-less error settle flips the newest running slot to error, no phantom", () => {
    const s = useResultsStore.getState();
    s.upsertLiveGeneration("wf", "n", "j1", {
      createdAt: 1,
      status: "running",
      outputs: {}
    });
    s.upsertLiveGeneration("wf", "n", "j1", {
      status: "error",
      error: "boom"
    });
    const list = live("wf", "n");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: "j1",
      jobId: "j1",
      status: "error",
      error: "boom"
    });
  });

  it("isolates distinct node keys", () => {
    const s = useResultsStore.getState();
    s.upsertLiveGeneration("wf", "n", "j1", {
      index: 0,
      status: "completed",
      outputs: { output: "a" }
    });
    s.upsertLiveGeneration("wf", "n", "j1", {
      index: 1,
      status: "completed",
      outputs: { output: "b" }
    });
    s.upsertLiveGeneration("wf", "n2", "j1", {
      index: 0,
      status: "completed",
      outputs: { output: "c" }
    });
    expect(live("wf", "n").map((g) => g.id)).toEqual(["j1", "j1#1"]);
    expect(live("wf", "n2").map((g) => g.id)).toEqual(["j1"]);
  });
});
