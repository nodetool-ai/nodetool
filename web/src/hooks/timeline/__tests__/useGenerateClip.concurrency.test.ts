import {
  __setJobContextForTests,
  __resetGenerateClipSubscriptionsForTests,
  handleJobMessage
} from "../useGenerateClip";
import { useTimelineGenerationStore } from "../../../stores/timeline/TimelineGenerationStore";

describe("useGenerateClip concurrent resolution", () => {
  beforeEach(() => {
    __resetGenerateClipSubscriptionsForTests();
    useTimelineGenerationStore.setState({ clipJobs: {}, jobToClip: {} });
  });

  it("resolves each concurrent job's own output asset", async () => {
    const store = useTimelineGenerationStore.getState();
    store.registerJob("clip1", "A", "wf");
    store.registerJob("clip2", "B", "wf");
    __setJobContextForTests("A", { clipId: "clip1", workflowId: "wf", selectedOutputNodeId: "out" });
    __setJobContextForTests("B", { clipId: "clip2", workflowId: "wf", selectedOutputNodeId: "out" });

    const spy = jest.spyOn(useTimelineGenerationStore.getState(), "updateJobStatus");

    await handleJobMessage("A", { type: "output_update", node_id: "out", value: { asset_id: "assetA" }, job_id: "A", workflow_id: "wf" } as never);
    await handleJobMessage("B", { type: "output_update", node_id: "out", value: { asset_id: "assetB" }, job_id: "B", workflow_id: "wf" } as never);
    await handleJobMessage("A", { type: "job_update", status: "completed", job_id: "A", workflow_id: "wf" } as never);
    await handleJobMessage("B", { type: "job_update", status: "completed", job_id: "B", workflow_id: "wf" } as never);

    expect(spy).toHaveBeenCalledWith("A", "completed", { assetId: "assetA" });
    expect(spy).toHaveBeenCalledWith("B", "completed", { assetId: "assetB" });
  });
});
