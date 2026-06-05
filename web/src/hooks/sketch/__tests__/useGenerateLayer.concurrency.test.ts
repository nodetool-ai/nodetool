import {
  __setJobContextForTests,
  __resetGenerateLayerSubscriptionsForTests,
  handleJobMessage
} from "../useGenerateLayer";
import { useSketchGenerationStore } from "../../../stores/sketch/SketchGenerationStore";

const ctx = (layerId: string, workflowId: string, outNode: string) => ({
  layerId, documentId: "doc", workflowId, selectedOutputNodeId: outNode
});

describe("useGenerateLayer concurrent resolution", () => {
  beforeEach(() => {
    __resetGenerateLayerSubscriptionsForTests();
    useSketchGenerationStore.setState({ layerJobs: {}, jobToLayer: {} });
  });

  it("resolves each concurrent job's own output asset", async () => {
    const store = useSketchGenerationStore.getState();
    store.registerJob("layer1", "A", "wf");
    store.registerJob("layer2", "B", "wf");
    __setJobContextForTests("A", ctx("layer1", "wf", "out"));
    __setJobContextForTests("B", ctx("layer2", "wf", "out"));

    const spy = jest.spyOn(useSketchGenerationStore.getState(), "updateJobStatus");

    // Interleaved outputs for the SAME output node id, different jobs.
    await handleJobMessage("A", { type: "output_update", node_id: "out", value: { asset_id: "assetA" }, job_id: "A", workflow_id: "wf" } as never);
    await handleJobMessage("B", { type: "output_update", node_id: "out", value: { asset_id: "assetB" }, job_id: "B", workflow_id: "wf" } as never);
    await handleJobMessage("A", { type: "job_update", status: "completed", job_id: "A", workflow_id: "wf" } as never);
    await handleJobMessage("B", { type: "job_update", status: "completed", job_id: "B", workflow_id: "wf" } as never);

    expect(spy).toHaveBeenCalledWith("A", "completed", { assetId: "assetA" });
    expect(spy).toHaveBeenCalledWith("B", "completed", { assetId: "assetB" });
  });
});
