/**
 * mergeClipsAt — inverse of splitClip. A scene break that split a clip should,
 * on removal, merge the halves back into the original clip.
 */

import { createTimelineStore } from "../TimelineStore";
import { makeClip, splitClip } from "@nodetool-ai/timeline";

describe("mergeClipsAt", () => {
  const baseClip = () =>
    makeClip({
      id: "a",
      trackId: "v",
      mediaType: "video",
      startMs: 0,
      durationMs: 1000,
      inPointMs: 0,
      outPointMs: 1000,
      currentAssetId: "asset-1"
    });

  it("merges a split pair back into the original clip", () => {
    const store = createTimelineStore();
    const [left, right] = splitClip(baseClip(), 400);
    store.setState({ clips: [left, right] });

    store.getState().mergeClipsAt(400);

    const clips = store.getState().clips;
    expect(clips).toHaveLength(1);
    expect(clips[0].startMs).toBe(0);
    expect(clips[0].durationMs).toBe(1000);
    expect(clips[0].inPointMs).toBe(0);
    expect(clips[0].outPointMs).toBe(1000);
  });

  it("leaves unrelated abutting clips (different source) untouched", () => {
    const store = createTimelineStore();
    const a = makeClip({
      id: "a",
      trackId: "v",
      startMs: 0,
      durationMs: 400,
      inPointMs: 0,
      outPointMs: 400,
      currentAssetId: "asset-1"
    });
    const b = makeClip({
      id: "b",
      trackId: "v",
      startMs: 400,
      durationMs: 600,
      inPointMs: 0, // NOT contiguous with a's outPoint → not a split pair
      outPointMs: 600,
      currentAssetId: "asset-2"
    });
    store.setState({ clips: [a, b] });

    store.getState().mergeClipsAt(400);

    expect(store.getState().clips).toHaveLength(2);
  });
});
