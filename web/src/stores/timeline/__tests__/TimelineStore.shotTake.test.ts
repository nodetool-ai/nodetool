import { describe, it, expect } from "@jest/globals";
import { makeClip } from "@nodetool-ai/timeline";

import { createTimelineStore, timelineTemporalOf } from "../TimelineStore";

function storeWithShotClips() {
  const store = createTimelineStore();
  store.getState().addTrack("video", "Video 1");
  const videoTrackId = store.getState().tracks[0].id;
  const audioTrackId = store.getState().getOrCreateAudioTrack();
  const shotFields = {
    startMs: 0,
    durationMs: 4000,
    inPointMs: 0,
    outPointMs: 4000,
    status: "generated" as const,
    currentAssetId: "take-1",
    storyboardBoardId: "board",
    storyboardShotId: "shot",
    linkId: "lnk"
  };
  const video = makeClip({ ...shotFields, trackId: videoTrackId, mediaType: "video" });
  const audio = makeClip({ ...shotFields, trackId: audioTrackId, mediaType: "audio" });
  const other = makeClip({
    ...shotFields,
    trackId: videoTrackId,
    startMs: 5000,
    mediaType: "video",
    storyboardShotId: "other",
    linkId: undefined
  });
  store.getState().addClips([video, audio, other]);
  return { store, video, audio, other };
}

describe("applyShotTake", () => {
  it("puts the take on the shot's video clip and audio twin in one undo step", () => {
    const { store, video, audio, other } = storeWithShotClips();
    const before = timelineTemporalOf(store).pastStates.length;

    const changed = store
      .getState()
      .applyShotTake("board", "shot", { assetId: "take-2", durationMs: 3000 });

    expect(changed.sort()).toEqual([video.id, audio.id].sort());
    const clips = store.getState().clips;
    for (const id of [video.id, audio.id]) {
      const clip = clips.find((c) => c.id === id);
      expect(clip?.currentAssetId).toBe("take-2");
      expect(clip?.durationMs).toBe(3000);
    }
    expect(clips.find((c) => c.id === other.id)?.currentAssetId).toBe("take-1");
    expect(timelineTemporalOf(store).pastStates.length).toBe(before + 1);
  });

  it("skips locked clips and records nothing when nothing changes", () => {
    const { store, video, audio } = storeWithShotClips();
    store.getState().patchClip(video.id, { locked: true });
    store.getState().patchClip(audio.id, { locked: true });
    const before = timelineTemporalOf(store).pastStates.length;

    expect(
      store.getState().applyShotTake("board", "shot", { assetId: "take-2" })
    ).toEqual([]);
    expect(timelineTemporalOf(store).pastStates.length).toBe(before);
  });
});
