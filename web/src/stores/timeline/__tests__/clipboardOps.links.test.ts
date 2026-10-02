import { beforeEach, describe, expect, it } from "@jest/globals";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import { createTimelineStore } from "../TimelineStore";
import {
  buildPastedClips,
  clearClipClipboard,
  copyClipsToClipboard
} from "../clipboardOps";

function linkedPair() {
  const videoTrack = makeTrack({ type: "video", name: "Video" });
  const audioTrack = makeTrack({ type: "audio", name: "Audio" });
  const video = makeClip({
    trackId: videoTrack.id,
    mediaType: "video",
    startMs: 0,
    durationMs: 1000,
    linkId: "original-link"
  });
  const audio = makeClip({
    trackId: audioTrack.id,
    mediaType: "audio",
    startMs: 0,
    durationMs: 1000,
    linkId: "original-link"
  });
  return { tracks: [videoTrack, audioTrack], clips: [video, audio] };
}

describe("clipboard links", () => {
  beforeEach(clearClipClipboard);

  it("gives a pasted pair a shared link distinct from its originals", () => {
    const { tracks, clips } = linkedPair();
    copyClipsToClipboard(clips);

    const pasted = buildPastedClips(tracks, 2000);

    expect(pasted).toHaveLength(2);
    expect(pasted[0].linkId).toBeDefined();
    expect(pasted[1].linkId).toBe(pasted[0].linkId);
    expect(pasted[0].linkId).not.toBe(clips[0].linkId);
    expect(clips.map((clip) => clip.linkId)).toEqual([
      "original-link",
      "original-link"
    ]);
  });

  it("pastes one half of a linked pair without a link", () => {
    const { tracks, clips } = linkedPair();
    copyClipsToClipboard([clips[0]]);

    const pasted = buildPastedClips(tracks, 2000);

    expect(pasted).toHaveLength(1);
    expect(pasted[0].linkId).toBeUndefined();
  });

  it("drops the link when its partner has no compatible destination track", () => {
    const { clips } = linkedPair();
    copyClipsToClipboard(clips);
    const destination = makeTrack({ type: "video", name: "Destination" });

    const pasted = buildPastedClips([destination], 2000);

    expect(pasted).toHaveLength(1);
    expect(pasted[0].mediaType).toBe("video");
    expect(pasted[0].trackId).toBe(destination.id);
    expect(pasted[0].linkId).toBeUndefined();
  });

  it("creates independent linked pairs on repeated pastes", () => {
    const { tracks, clips } = linkedPair();
    copyClipsToClipboard(clips);

    const first = buildPastedClips(tracks, 2000);
    const second = buildPastedClips(tracks, 4000);

    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
    expect(first[0].linkId).toBeDefined();
    expect(second[0].linkId).toBeDefined();
    expect(first[1].linkId).toBe(first[0].linkId);
    expect(second[1].linkId).toBe(second[0].linkId);
    expect(second[0].linkId).not.toBe(first[0].linkId);
  });

  it("moves the pasted partner without moving either original", () => {
    const { tracks, clips } = linkedPair();
    const store = createTimelineStore();
    store.setState({ tracks, clips });
    copyClipsToClipboard(clips);
    const pasted = buildPastedClips(tracks, 2000);
    store.getState().addClips(pasted);

    store.getState().moveSelectedClips(pasted[0].id, new Set([pasted[0].id]), 500);

    const updated = new Map(store.getState().clips.map((clip) => [clip.id, clip]));
    expect(updated.get(pasted[0].id)?.startMs).toBe(2500);
    expect(updated.get(pasted[1].id)?.startMs).toBe(2500);
    expect(updated.get(clips[0].id)?.startMs).toBe(0);
    expect(updated.get(clips[1].id)?.startMs).toBe(0);
  });
});
