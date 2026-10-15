/**
 * Loading a legacy transcript folds each caption clip's words onto its
 * voiceover clip. UX study 3 (D11) saw the emptied "Captions" track stay as
 * an empty lane while the preview still drew the caption, and removing the
 * lane changed nothing. A caption track the migration empties is dropped.
 */
import { describe, it, expect } from "@jest/globals";
import { createTimelineStore } from "../TimelineStore";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import type { TimelineSequence } from "@nodetool-ai/timeline";

const sequence = (
  overrides: Partial<TimelineSequence>
): TimelineSequence => ({
  id: "seq-1",
  projectId: "proj-1",
  name: "Seq",
  fps: 30,
  width: 1920,
  height: 1080,
  durationMs: 3000,
  tracks: [],
  clips: [],
  markers: [],
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  ...overrides
});

const legacy = (extraCaption: boolean) => {
  const voice = makeTrack({ type: "audio", name: "Voiceover", index: 0 });
  const captions = makeTrack({ type: "subtitle", name: "Captions", index: 1 });
  const audio = makeClip({
    trackId: voice.id,
    name: "vo",
    startMs: 0,
    durationMs: 3000,
    mediaType: "audio"
  });
  const caption = makeClip({
    trackId: captions.id,
    name: "cap",
    startMs: 0,
    durationMs: 3000,
    mediaType: "text",
    caption: { words: [{ word: "Hello", startMs: 0, endMs: 500 }] }
  });
  const other = makeClip({
    trackId: captions.id,
    name: "title card",
    startMs: 0,
    durationMs: 1000,
    mediaType: "text"
  });
  return {
    captions,
    seq: sequence({
      tracks: [voice, captions],
      clips: extraCaption ? [audio, caption, other] : [audio, caption],
      transcript: [
        { id: "l1", text: "Hello", beatStartMs: 0, clipIds: [audio.id, caption.id] }
      ]
    })
  };
};

describe("TimelineStore legacy captions", () => {
  it("drops the caption track the migration emptied", () => {
    const store = createTimelineStore();
    const { captions, seq } = legacy(false);
    store.getState().loadSequence(seq);
    const state = store.getState();
    expect(state.tracks.some((t) => t.id === captions.id)).toBe(false);
    expect(state.clips.find((c) => c.mediaType === "audio")?.caption).toBeDefined();
  });

  it("keeps a caption track that still holds other clips", () => {
    const store = createTimelineStore();
    const { captions, seq } = legacy(true);
    store.getState().loadSequence(seq);
    expect(store.getState().tracks.some((t) => t.id === captions.id)).toBe(true);
  });
});
