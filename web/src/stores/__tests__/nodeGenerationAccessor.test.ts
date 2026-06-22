import {
  getNodeGenerations,
  getNodeSelectedOutputs
} from "../nodeGenerationAccessor";
import useResultsStore from "../ResultsStore";
import { useWorkflowAssetStore } from "../WorkflowAssetStore";

beforeEach(() => {
  useResultsStore.setState({ liveGenerations: {} } as never);
  useWorkflowAssetStore.setState({ assetsByWorkflow: {} } as never);
});

it("merges a persisted asset with a live generation for the node", () => {
  useWorkflowAssetStore.setState({
    assetsByWorkflow: {
      wf: [
        {
          id: "a1",
          node_id: "n1",
          job_id: "j1",
          content_type: "image/png",
          get_url: "http://x/a1.png",
          created_at: "2026-01-01T00:00:00Z"
        } as never
      ]
    }
  } as never);
  useResultsStore.getState().upsertLiveGeneration("wf", "n1", "j2", {
    createdAt: 2_000_000_000_000,
    status: "completed",
    outputs: { output: "live" }
  });
  const gens = getNodeGenerations("wf", "n1");
  expect(gens.map((g) => g.id)).toEqual(["a1", "j2"]);
});

describe("getNodeSelectedOutputs", () => {
  /** Seed two completed live generations the multi-select can read. */
  const seedTwoCompleted = () => {
    useResultsStore.getState().upsertLiveGeneration("wf", "n1", "ja", {
      createdAt: 1_000_000_000_000,
      status: "completed",
      outputs: { output: "valA" }
    });
    useResultsStore.getState().upsertLiveGeneration("wf", "n1", "jb", {
      createdAt: 2_000_000_000_000,
      status: "completed",
      outputs: { output: "valB" }
    });
  };

  it("returns undefined when fewer than 2 generations are selected", () => {
    seedTwoCompleted();
    expect(
      getNodeSelectedOutputs("wf", "n1", "output", undefined)
    ).toBeUndefined();
    expect(getNodeSelectedOutputs("wf", "n1", "output", [])).toBeUndefined();
    expect(getNodeSelectedOutputs("wf", "n1", "output", ["ja"])).toBeUndefined();
  });

  it("returns the multi-select outputs in pick order from the merged timeline", () => {
    seedTwoCompleted();
    // Pick order is jb then ja (not timeline order).
    expect(getNodeSelectedOutputs("wf", "n1", "output", ["jb", "ja"])).toEqual([
      "valB",
      "valA"
    ]);
  });

  it("returns undefined when nothing in the set qualifies", () => {
    seedTwoCompleted();
    // Both ids are absent from the timeline → selectedOutputValues yields [].
    expect(
      getNodeSelectedOutputs("wf", "n1", "output", ["gone1", "gone2"])
    ).toBeUndefined();
  });
});
