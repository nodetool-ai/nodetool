/**
 * insertTrack / duplicateTrack — the track actions behind the header's
 * context menu. Each case checks the invariant the UI relies on: `index`
 * equals array position after every insert, and a duplicated track's clips
 * are new clips on the new track, not the originals re-homed.
 */
import { describe, it, expect } from "@jest/globals";
import { makeClip, makeTrackEffect } from "@nodetool-ai/timeline";
import { createTimelineStore } from "../TimelineStore";

function indices(store: ReturnType<typeof createTimelineStore>): number[] {
  return store.getState().tracks.map((t) => t.index);
}

describe("TimelineStore.insertTrack", () => {
  it("inserts at the given position and renumbers every track", () => {
    const store = createTimelineStore();
    store.getState().addTrack("video", "V1");
    store.getState().addTrack("video", "V2");
    const [v1, v2] = store.getState().tracks.map((t) => t.id);

    const inserted = store.getState().insertTrack("audio", 1, "A1");

    expect(store.getState().tracks.map((t) => t.id)).toEqual([v1, inserted, v2]);
    expect(indices(store)).toEqual([0, 1, 2]);
    expect(store.getState().tracks[1]).toMatchObject({
      type: "audio",
      name: "A1",
      visible: true,
      locked: false
    });
  });

  it("clamps the position to the ends", () => {
    const store = createTimelineStore();
    store.getState().addTrack("video", "V1");
    const first = store.getState().insertTrack("video", -5, "front");
    const last = store.getState().insertTrack("video", 99, "back");
    const ids = store.getState().tracks.map((t) => t.id);
    expect(ids[0]).toBe(first);
    expect(ids[ids.length - 1]).toBe(last);
    expect(indices(store)).toEqual([0, 1, 2]);
  });

  it("addTrack appends through insertTrack with the same auto-name", () => {
    const store = createTimelineStore();
    store.getState().addTrack("audio");
    store.getState().addTrack("video");
    expect(store.getState().tracks.map((t) => t.name)).toEqual([
      "audio 1",
      "video 2"
    ]);
    expect(indices(store)).toEqual([0, 1]);
  });
});

describe("TimelineStore.duplicateTrack", () => {
  function storeWithClips() {
    const store = createTimelineStore();
    store.getState().addTrack("video", "Video 1");
    store.getState().addTrack("audio", "Audio 1");
    const [videoId, audioId] = store.getState().tracks.map((t) => t.id);
    store.setState({
      clips: [
        makeClip({ id: "a", trackId: videoId, startMs: 0, durationMs: 1000 }),
        makeClip({ id: "b", trackId: videoId, startMs: 2000, durationMs: 500 }),
        makeClip({ id: "c", trackId: audioId, startMs: 0, durationMs: 1000 })
      ]
    });
    return { store, videoId, audioId };
  }

  it("inserts the copy right after the source and renumbers", () => {
    const { store, videoId, audioId } = storeWithClips();
    const copyId = store.getState().duplicateTrack(videoId);

    expect(copyId).not.toBeNull();
    expect(copyId).not.toBe(videoId);
    expect(store.getState().tracks.map((t) => t.id)).toEqual([
      videoId,
      copyId,
      audioId
    ]);
    expect(indices(store)).toEqual([0, 1, 2]);
  });

  it("copies name, type and settings, with fresh effect ids", () => {
    const { store, videoId } = storeWithClips();
    const effect = makeTrackEffect("videoBlur");
    store.setState({
      tracks: store.getState().tracks.map((t) =>
        t.id === videoId
          ? { ...t, heightPx: 120, locked: true, effects: [effect] }
          : t
      )
    });

    const copyId = store.getState().duplicateTrack(videoId);
    const copy = store.getState().tracks.find((t) => t.id === copyId)!;

    expect(copy).toMatchObject({
      name: "Video 1 copy",
      type: "video",
      heightPx: 120,
      locked: true
    });
    expect(copy.effects).toHaveLength(1);
    expect(copy.effects![0]).toMatchObject({ type: "videoBlur", enabled: true });
    expect(copy.effects![0].id).not.toBe(effect.id);
    // The copy owns its effect list: mutating it must not reach the source.
    expect(copy.effects).not.toBe(
      store.getState().tracks.find((t) => t.id === videoId)!.effects
    );
  });

  it("copies every clip on the track under new ids onto the new track", () => {
    const { store, videoId } = storeWithClips();
    const copyId = store.getState().duplicateTrack(videoId)!;
    const clips = store.getState().clips;

    expect(clips).toHaveLength(5);
    const originals = clips.filter((c) => c.trackId === videoId);
    const copies = clips.filter((c) => c.trackId === copyId);
    expect(originals.map((c) => c.id).sort()).toEqual(["a", "b"]);
    expect(copies).toHaveLength(2);
    for (const c of copies) {
      expect(["a", "b", "c"]).not.toContain(c.id);
    }
    expect(copies.map((c) => [c.startMs, c.durationMs]).sort()).toEqual([
      [0, 1000],
      [2000, 500]
    ]);
  });

  it("drops a linkId whose partner lives on another track, keeps a same-track link under a fresh id", () => {
    const { store, videoId, audioId } = storeWithClips();
    store.setState({
      clips: [
        makeClip({ id: "v", trackId: videoId, startMs: 0, durationMs: 1000, linkId: "cross" }),
        makeClip({ id: "a", trackId: audioId, startMs: 0, durationMs: 1000, linkId: "cross" }),
        makeClip({ id: "p", trackId: videoId, startMs: 3000, durationMs: 100, linkId: "same" }),
        makeClip({ id: "q", trackId: videoId, startMs: 4000, durationMs: 100, linkId: "same" })
      ]
    });

    const copyId = store.getState().duplicateTrack(videoId)!;
    const copies = store.getState().clips.filter((c) => c.trackId === copyId);
    const crossCopy = copies.find((c) => c.startMs === 0)!;
    const sameCopies = copies.filter((c) => c.startMs >= 3000);

    expect(crossCopy.linkId).toBeUndefined();
    expect(sameCopies).toHaveLength(2);
    expect(sameCopies[0].linkId).toBeDefined();
    expect(sameCopies[0].linkId).toBe(sameCopies[1].linkId);
    expect(sameCopies[0].linkId).not.toBe("same");
  });

  it("returns null and changes nothing for an unknown track", () => {
    const { store } = storeWithClips();
    const before = store.getState();
    expect(store.getState().duplicateTrack("nope")).toBeNull();
    expect(store.getState().tracks).toBe(before.tracks);
    expect(store.getState().clips).toBe(before.clips);
  });
});

describe("TimelineStore track folders", () => {
  it("creates a folder around a track as one undo step", () => {
    const store = createTimelineStore();
    store.getState().addTrack("video", "Picture");
    const trackId = store.getState().tracks[0].id;
    const folderId = store.getState().createTrackFolderForTrack(trackId);
    expect(folderId).not.toBeNull();
    expect(store.getState().tracks[0].folderId).toBe(folderId);

    store.temporal.getState().undo();
    expect(store.getState().trackFolders).toEqual([]);
    expect(store.getState().tracks[0].folderId).toBeUndefined();
  });

  it("groups and ungroups tracks without changing their order or clips", () => {
    const store = createTimelineStore();
    store.getState().addTrack("video", "Picture");
    store.getState().addTrack("audio", "Sound");
    const [picture, sound] = store.getState().tracks.map((track) => track.id);
    store.setState({ clips: [makeClip({ id: "clip", trackId: sound, startMs: 0, durationMs: 1000 })] });
    const folderId = store.getState().addTrackFolder("Scene");
    store.getState().setTrackFolder(sound, folderId);
    store.getState().renameTrackFolder(folderId, "Audio beds");

    expect(store.getState().trackFolders).toEqual([{ id: folderId, name: "Audio beds" }]);
    expect(store.getState().tracks.map((track) => track.id)).toEqual([picture, sound]);
    expect(store.getState().tracks[1].folderId).toBe(folderId);
    expect(store.getState().clips[0].trackId).toBe(sound);

    store.getState().removeTrackFolder(folderId);
    expect(store.getState().trackFolders).toEqual([]);
    expect(store.getState().tracks[1].folderId).toBeUndefined();
    expect(store.getState().clips[0].trackId).toBe(sound);
  });
});
