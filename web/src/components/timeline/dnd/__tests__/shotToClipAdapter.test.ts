import { describe, it, expect } from "@jest/globals";

import {
  createTimelineStore,
  timelineTemporalOf
} from "../../../../stores/timeline/TimelineStore";
import type { StoryboardShotDragPayload } from "../../../../lib/dragdrop";
import { serializeDragData, deserializeDragData } from "../../../../lib/dragdrop";
import { dropShotOnTrack, isShotDrag } from "../shotToClipAdapter";

const videoShot: StoryboardShotDragPayload = {
  boardId: "board-1",
  shotId: "shot-1",
  name: "Harbor",
  placement: {
    mediaType: "video",
    assetId: "take-1",
    durationMs: 4000,
    inPointMs: 1000,
    outPointMs: 5000
  }
};

const stillShot: StoryboardShotDragPayload = {
  boardId: "board-1",
  shotId: "shot-2",
  name: "Gull",
  placement: { mediaType: "image", assetId: "still-1", durationMs: 3000 }
};

/** A DataTransfer stand-in that keeps what is set on it. */
const fakeDataTransfer = (): DataTransfer => {
  const data = new Map<string, string>();
  return {
    get types() {
      return [...data.keys()];
    },
    setData: (key: string, value: string) => void data.set(key, value),
    getData: (key: string) => data.get(key) ?? ""
  } as unknown as DataTransfer;
};

describe("dropShotOnTrack", () => {
  it("places a video shot linked to its shot, with an audio twin", () => {
    const store = createTimelineStore();
    store.getState().addTrack("video", "Video 1");
    const trackId = store.getState().tracks[0].id;

    const id = dropShotOnTrack(store, videoShot, trackId, 2000, "overlap");

    const clips = store.getState().clips;
    const video = clips.find((clip) => clip.id === id);
    expect(video).toMatchObject({
      trackId,
      mediaType: "video",
      startMs: 2000,
      durationMs: 4000,
      inPointMs: 1000,
      outPointMs: 5000,
      currentAssetId: "take-1",
      storyboardBoardId: "board-1",
      storyboardShotId: "shot-1"
    });
    const audio = clips.find((clip) => clip.mediaType === "audio");
    expect(audio).toMatchObject({
      startMs: 2000,
      currentAssetId: "take-1",
      linkId: video?.linkId,
      storyboardShotId: "shot-1"
    });
    expect(video?.linkId).toBeTruthy();
    expect(
      store.getState().tracks.find((track) => track.id === audio?.trackId)?.type
    ).toBe("audio");
  });

  it("places a still shot as one image clip", () => {
    const store = createTimelineStore();
    store.getState().addTrack("video", "Video 1");
    const trackId = store.getState().tracks[0].id;

    dropShotOnTrack(store, stillShot, trackId, 0, "overlap");

    const clips = store.getState().clips;
    expect(clips).toHaveLength(1);
    expect(clips[0]).toMatchObject({
      mediaType: "image",
      currentAssetId: "still-1",
      linkId: undefined,
      storyboardShotId: "shot-2"
    });
  });

  it("creates the track lazily and undoes the whole drop in one step", () => {
    const store = createTimelineStore();
    const pastBefore = timelineTemporalOf(store).pastStates.length;

    dropShotOnTrack(
      store,
      videoShot,
      () => {
        store.getState().addTrack("video");
        return store.getState().tracks.slice(-1)[0]?.id ?? "";
      },
      0,
      "overlap"
    );

    expect(store.getState().clips).toHaveLength(2);
    expect(timelineTemporalOf(store).pastStates.length).toBe(pastBefore + 1);
    timelineTemporalOf(store).undo();
    expect(store.getState().clips).toHaveLength(0);
    expect(store.getState().tracks).toHaveLength(0);
  });
});

describe("storyboard-shot drag data", () => {
  it("is detectable by type and round-trips its payload", () => {
    const dataTransfer = fakeDataTransfer();
    expect(isShotDrag(dataTransfer)).toBe(false);

    serializeDragData({ type: "storyboard-shot", payload: videoShot }, dataTransfer);

    expect(isShotDrag(dataTransfer)).toBe(true);
    expect(deserializeDragData(dataTransfer)).toEqual({
      type: "storyboard-shot",
      payload: videoShot
    });
  });
});
