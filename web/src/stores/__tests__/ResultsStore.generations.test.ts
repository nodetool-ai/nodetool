import useResultsStore from "../ResultsStore";

const reset = () => useResultsStore.setState({ liveGenerations: {} } as never);

describe("ResultsStore live generations", () => {
  beforeEach(reset);

  it("upserts a running generation then finalizes it by jobId", () => {
    const s = useResultsStore.getState();
    s.upsertLiveGeneration("wf", "n1", "j1", {
      createdAt: 1,
      status: "running",
      outputs: {}
    });
    s.upsertLiveGeneration("wf", "n1", "j1", {
      status: "completed",
      outputs: { output: "X" }
    });
    const list = useResultsStore.getState().getLiveGenerations("wf", "n1");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: "j1",
      jobId: "j1",
      status: "completed",
      outputs: { output: "X" }
    });
  });

  it("appends a second generation for a new job", () => {
    const s = useResultsStore.getState();
    s.upsertLiveGeneration("wf", "n1", "j1", {
      createdAt: 1,
      status: "completed",
      outputs: {}
    });
    s.upsertLiveGeneration("wf", "n1", "j2", {
      createdAt: 2,
      status: "completed",
      outputs: {}
    });
    expect(
      useResultsStore
        .getState()
        .getLiveGenerations("wf", "n1")
        .map((g) => g.id)
    ).toEqual(["j1", "j2"]);
  });
});
