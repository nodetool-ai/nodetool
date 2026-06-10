import {
  __setJobContextForTests,
  __resetGenerateClipSubscriptionsForTests,
  handleJobMessage
} from "../useGenerateClip";
import { useTimelineGenerationStore } from "../../../stores/timeline/TimelineGenerationStore";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";

const makeClip = (id: string) => ({
  id,
  trackId: "track-1",
  name: id,
  startMs: 0,
  durationMs: 1000,
  mediaType: "video" as const,
  workflowId: "wf",
  sourceType: "generated" as const,
  status: "generating" as const,
  selectedOutputNodeId: "out",
  locked: false,
  versions: []
});

describe("useGenerateClip concurrent resolution", () => {
  beforeEach(() => {
    __resetGenerateClipSubscriptionsForTests();
    useTimelineGenerationStore.setState({ clipJobs: {}, jobToClip: {} });
    useTimelineStore.setState({
      sequenceId: "seq-1",
      tracks: [{ id: "track-1", name: "Track", type: "video", index: 0, visible: true, locked: false }],
      clips: [makeClip("clip1"), makeClip("clip2")],
      markers: []
    });
  });

  it("resolves each concurrent job's own output asset and applies it to the clip", async () => {
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

    // The clips actually received their assets (version + currentAssetId).
    const clips = useTimelineStore.getState().clips;
    const clip1 = clips.find((c) => c.id === "clip1");
    const clip2 = clips.find((c) => c.id === "clip2");
    expect(clip1?.currentAssetId).toBe("assetA");
    expect(clip1?.status).toBe("generated");
    expect(clip1?.versions).toHaveLength(1);
    expect(clip2?.currentAssetId).toBe("assetB");
    expect(clip2?.status).toBe("generated");
    expect(clip2?.versions).toHaveLength(1);
  });
});
