import { getNodeGenerations } from "../nodeGenerationAccessor";
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
