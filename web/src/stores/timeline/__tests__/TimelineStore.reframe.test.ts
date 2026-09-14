import { describe, expect, it } from "@jest/globals";

import { makeClip } from "@nodetool-ai/timeline";

import { createTimelineStore } from "../TimelineStore";

const clipId = "clip-video";

function storeWithClip() {
  const store = createTimelineStore();
  store.setState({
    clips: [
      makeClip({
        id: clipId,
        trackId: "track-video",
        name: "Speaker",
        mediaType: "video",
        sourceType: "imported",
        startMs: 0,
        durationMs: 3000
      })
    ]
  });
  return store;
}

describe("TimelineStore smart reframe", () => {
  it("selects an existing subject track without changing clip timing", () => {
    const store = storeWithClip();

    store.getState().setClipReframeSubject(clipId, "track", "subject-person");

    const clip = store.getState().clips[0];
    expect(clip?.reframe).toEqual({
      mode: "track",
      trackId: "subject-person"
    });
    expect(clip?.startMs).toBe(0);
    expect(clip?.durationMs).toBe(3000);
  });

  it("records ordered source-time corrections and replaces one at the same time", () => {
    const store = storeWithClip();

    store.getState().addClipReframeKeyframe(clipId, 1200, 0.7, 0.4, 1.2);
    store.getState().addClipReframeKeyframe(clipId, 200, 0.2, 0.5, 1);
    store.getState().addClipReframeKeyframe(clipId, 1200, 0.8, 0.45, 1.3);

    expect(store.getState().clips[0]?.reframe?.keyframes).toEqual([
      { sourceMs: 200, x: 0.2, y: 0.5, zoom: 1 },
      { sourceMs: 1200, x: 0.8, y: 0.45, zoom: 1.3 }
    ]);
  });

  it("clears framing while preserving the rest of the clip", () => {
    const store = storeWithClip();
    store.getState().setClipReframeSubject(clipId, "auto");
    store.getState().addClipReframeKeyframe(clipId, 500, 0.5, 0.5, 1);

    store.getState().clearClipReframe(clipId);

    expect(store.getState().clips[0]?.reframe).toBeUndefined();
    expect(store.getState().clips[0]?.name).toBe("Speaker");
  });
});
