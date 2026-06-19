import { describe, it, expect } from "@jest/globals";
import { createTimelineStore } from "../TimelineStore";
import { makeTrack, makeClip } from "@nodetool-ai/timeline";

function storeWithLinkedPair() {
  const store = createTimelineStore();
  const s = store.getState();
  s.addTrack("video", "Video 1");
  const videoTrackId = store.getState().tracks[0].id;
  const audioTrackId = s.getOrCreateAudioTrack();
  const video = makeClip({
    trackId: videoTrackId,
    mediaType: "video",
    startMs: 1000,
    durationMs: 5000,
    inPointMs: 0,
    outPointMs: 5000,
    linkId: "lnk-1",
    status: "generated"
  });
  const audio = makeClip({
    trackId: audioTrackId,
    mediaType: "audio",
    startMs: 1000,
    durationMs: 5000,
    inPointMs: 0,
    outPointMs: 5000,
    linkId: "lnk-1",
    status: "generating"
  });
  store.getState().addClips([video, audio]);
  return { store, videoId: video.id, audioId: audio.id, audioTrackId };
}

describe("getOrCreateAudioTrack", () => {
  it("creates an audio track when none exists and returns its id", () => {
    const store = createTimelineStore();
    store.getState().addTrack("video", "Video 1");
    const id = store.getState().getOrCreateAudioTrack();
    const track = store.getState().tracks.find((t) => t.id === id);
    expect(track?.type).toBe("audio");
    expect(store.getState().tracks.filter((t) => t.type === "audio")).toHaveLength(1);
  });

  it("reuses the existing audio track", () => {
    const store = createTimelineStore();
    store.getState().addTrack("audio", "Audio 1");
    const existingId = store.getState().tracks[0].id;
    expect(store.getState().getOrCreateAudioTrack()).toBe(existingId);
    expect(store.getState().tracks.filter((t) => t.type === "audio")).toHaveLength(1);
  });
});

describe("linked move/trim/delete/unlink", () => {
  it("moveClip moves linked siblings by the same delta", () => {
    const { store, videoId, audioId } = storeWithLinkedPair();
    store.getState().moveClip(videoId, 500, undefined, undefined, undefined, true);
    const clips = store.getState().clips;
    expect(clips.find((c) => c.id === videoId)?.startMs).toBe(1500);
    expect(clips.find((c) => c.id === audioId)?.startMs).toBe(1500);
  });

  it("moveClip never reassigns the sibling's track", () => {
    const { store, videoId, audioId, audioTrackId } = storeWithLinkedPair();
    const videoTrackId = store.getState().tracks[0].id;
    store.getState().moveClip(videoId, 0, videoTrackId, undefined, undefined, true);
    expect(store.getState().clips.find((c) => c.id === audioId)?.trackId).toBe(
      audioTrackId
    );
  });

  it("trimClipStart trims linked siblings by the same delta", () => {
    const { store, videoId, audioId } = storeWithLinkedPair();
    // trimClip("start", delta) → startMs - delta, durationMs + delta. A
    // negative delta shrinks the head: start 1000 → 2000, duration 5000 → 4000.
    store.getState().trimClipStart(videoId, -1000);
    const clips = store.getState().clips;
    expect(clips.find((c) => c.id === videoId)?.startMs).toBe(2000);
    expect(clips.find((c) => c.id === audioId)?.startMs).toBe(2000);
    expect(clips.find((c) => c.id === audioId)?.durationMs).toBe(4000);
  });

  it("deleteClip removes the target and unlinks the lone survivor", () => {
    const { store, videoId, audioId } = storeWithLinkedPair();
    store.getState().deleteClip(audioId);
    const clips = store.getState().clips;
    expect(clips.find((c) => c.id === audioId)).toBeUndefined();
    expect(clips.find((c) => c.id === videoId)?.linkId).toBeUndefined();
  });

  it("unlinkClip clears linkId across the whole group", () => {
    const { store, videoId, audioId } = storeWithLinkedPair();
    store.getState().unlinkClip(videoId);
    const clips = store.getState().clips;
    expect(clips.find((c) => c.id === videoId)?.linkId).toBeUndefined();
    expect(clips.find((c) => c.id === audioId)?.linkId).toBeUndefined();
  });
});
