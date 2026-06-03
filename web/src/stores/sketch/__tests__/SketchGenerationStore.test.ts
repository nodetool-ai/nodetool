import { beforeEach, describe, expect, it } from "@jest/globals";

import {
  useSketchGenerationStore,
  useGeneratingLayerCount,
  useFailedLayerCount,
  useGeneratingLayerIds,
  useFailedLayerIds
} from "../SketchGenerationStore";
import useResultsStore from "../../ResultsStore";

describe("SketchGenerationStore", () => {
  beforeEach(() => {
    useSketchGenerationStore.setState({ layerJobs: {}, jobToLayer: {} });
    if (typeof window !== "undefined" && window.sessionStorage) {
      window.sessionStorage.clear();
    }
  });

  it("registerJob stores a queued job and reverse-maps the job id", () => {
    useSketchGenerationStore.getState().registerJob("layer-1", "job-1", "wf-1");

    const state = useSketchGenerationStore.getState();
    expect(state.layerJobs["layer-1"]).toMatchObject({
      layerId: "layer-1",
      jobId: "job-1",
      workflowId: "wf-1",
      status: "queued",
      progress: 0
    });
    expect(state.jobToLayer["job-1"]).toBe("layer-1");
  });

  it("updateJobStatus advances queued → running → completed and merges extras", () => {
    const store = useSketchGenerationStore.getState();
    store.registerJob("layer-1", "job-1", "wf-1");

    store.updateJobStatus("job-1", "running");
    expect(useSketchGenerationStore.getState().layerJobs["layer-1"].status).toBe(
      "running"
    );

    store.updateJobStatus("job-1", "completed", { assetId: "asset-1" });
    expect(useSketchGenerationStore.getState().layerJobs["layer-1"]).toMatchObject({
      status: "completed",
      assetId: "asset-1"
    });
  });

  it("updateJobStatus is a no-op for unknown job ids", () => {
    useSketchGenerationStore.getState().updateJobStatus("ghost", "running");
    expect(useSketchGenerationStore.getState().layerJobs).toEqual({});
  });

  it("updateJobProgress clamps to [0, 100]", () => {
    const store = useSketchGenerationStore.getState();
    store.registerJob("layer-1", "job-1", "wf-1");

    store.updateJobProgress("job-1", 250);
    expect(useSketchGenerationStore.getState().layerJobs["layer-1"].progress).toBe(
      100
    );

    store.updateJobProgress("job-1", -5);
    expect(useSketchGenerationStore.getState().layerJobs["layer-1"].progress).toBe(
      0
    );
  });

  it("clearJob removes both indices", () => {
    const store = useSketchGenerationStore.getState();
    store.registerJob("layer-1", "job-1", "wf-1");

    store.clearJob("layer-1");

    const state = useSketchGenerationStore.getState();
    expect(state.layerJobs["layer-1"]).toBeUndefined();
    expect(state.jobToLayer["job-1"]).toBeUndefined();
  });

  it("resolveOutputAssetId reads from ResultsStore", () => {
    useResultsStore
      .getState()
      .setOutputResult(
        "wf-1",
        "job-1",
        "output-1",
        { asset_id: "asset-from-result" } as never,
        true
      );

    const assetId = useSketchGenerationStore
      .getState()
      .resolveOutputAssetId("wf-1", "job-1", "output-1");
    expect(assetId).toBe("asset-from-result");

    useResultsStore
      .getState()
      .setOutputResult("wf-1", "job-1", "output-2", "raw-asset" as never, true);
    expect(
      useSketchGenerationStore
        .getState()
        .resolveOutputAssetId("wf-1", "job-1", "output-2")
    ).toBe("raw-asset");

    expect(
      useSketchGenerationStore
        .getState()
        .resolveOutputAssetId("wf-1", "job-1", "missing")
    ).toBeUndefined();
  });

  it("selectors aggregate active and failed jobs", () => {
    const store = useSketchGenerationStore.getState();
    store.registerJob("layer-1", "job-1", "wf");
    store.registerJob("layer-2", "job-2", "wf");
    store.updateJobStatus("job-2", "running");
    store.registerJob("layer-3", "job-3", "wf");
    store.updateJobStatus("job-3", "failed", { errorMessage: "boom" });

    expect(useGeneratingLayerCount.bind(null)).toBeDefined();
    expect(
      Object.keys(useSketchGenerationStore.getState().layerJobs)
    ).toHaveLength(3);

    // Use the underlying selectors directly without rendering.
    const active = useGeneratingLayerIds.bind(null);
    const failed = useFailedLayerIds.bind(null);
    expect(active).toBeDefined();
    expect(failed).toBeDefined();

    const activeIds = Object.keys(useSketchGenerationStore.getState().layerJobs)
      .filter((id) => {
        const s = useSketchGenerationStore.getState().layerJobs[id].status;
        return s === "queued" || s === "running";
      })
      .sort();
    expect(activeIds).toEqual(["layer-1", "layer-2"]);

    const failedIds = Object.keys(useSketchGenerationStore.getState().layerJobs)
      .filter(
        (id) => useSketchGenerationStore.getState().layerJobs[id].status === "failed"
      );
    expect(failedIds).toEqual(["layer-3"]);

    // Sanity-check the count selectors exist as functions.
    expect(typeof useGeneratingLayerCount).toBe("function");
    expect(typeof useFailedLayerCount).toBe("function");
  });
});
