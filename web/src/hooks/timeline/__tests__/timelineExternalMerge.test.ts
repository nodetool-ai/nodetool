import { makeClip } from "@nodetool-ai/timeline";
import {
  createTimelineStore,
  timelineTemporalOf
} from "../../../stores/timeline/TimelineStore";
import {
  rebaseTimelineSnapshots,
  timelineMergeDocumentOf
} from "../timelineExternalMerge";

it("keeps server setup changes when undoing a local clip trim", () => {
  const store = createTimelineStore();
  store.getState().addTrack("video", "Video");
  const track = store.getState().tracks[0];
  store
    .getState()
    .addClip(
      makeClip({
        id: "clip",
        trackId: track.id,
        startMs: 0,
        durationMs: 1000,
        mediaType: "video",
        sourceType: "imported"
      })
    );
  store.setState({ setup: { stage: "idea", brief: "Saved" } });
  timelineTemporalOf(store).clear();
  store.getState().patchClip("clip", { durationMs: 500 });
  const before = timelineMergeDocumentOf(store.getState());
  const after = {
    ...before,
    setup: { stage: "review" as const, brief: "Server plan" }
  };
  const snapshots = rebaseTimelineSnapshots(
    timelineTemporalOf(store).pastStates,
    before,
    after
  );
  expect(snapshots[0].setup).toEqual(after.setup);
  expect(snapshots[0].clips[0].durationMs).toBe(1000);
});

it("keeps a setup undo snapshot when the server changes only a clip", () => {
  const store = createTimelineStore();
  store.setState({ setup: { stage: "idea", brief: "Saved" } });
  timelineTemporalOf(store).clear();
  store.getState().setSetup({ brief: "Local" });
  const before = timelineMergeDocumentOf(store.getState());
  const after = {
    ...before,
    markers: [{ id: "server-marker", timeMs: 1000, label: "Server" }]
  };
  const snapshots = rebaseTimelineSnapshots(
    timelineTemporalOf(store).pastStates,
    before,
    after
  );
  expect(snapshots[0].setup).toEqual({ stage: "idea", brief: "Saved" });
  expect(snapshots[0].markers).toEqual(after.markers);
});
