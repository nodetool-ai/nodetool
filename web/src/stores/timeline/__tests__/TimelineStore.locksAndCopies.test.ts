/**
 * Regressions from the fourth timeline audit (2026-10-10): drops and copies
 * that ignored locks or lost what a clip carries, splits that dropped the
 * selection, and MIDI and take edits that ignored locks or the note cap.
 */

import { describe, it, expect } from "@jest/globals";
import {
  makeClip,
  makeClipVersion,
  makeTrack,
  MIDI_MAX_NOTES_PER_CLIP,
  type TimelineClip
} from "@nodetool-ai/timeline";
import { createTimelineStore, timelineTemporalOf } from "../TimelineStore";

function clipsById(store: ReturnType<typeof createTimelineStore>) {
  return new Map(store.getState().clips.map((c) => [c.id, c]));
}

describe("resolveDrop and locks", () => {
  it("an overwrite drop leaves a locked clip in place", () => {
    const store = createTimelineStore();
    const v1 = makeTrack({ type: "video" });
    const a = makeClip({ id: "a", trackId: v1.id, startMs: 4000, durationMs: 2000 });
    const locked = makeClip({
      id: "l",
      trackId: v1.id,
      startMs: 4000,
      durationMs: 2000,
      locked: true
    });
    store.setState({ tracks: [v1], clips: [a, locked] });

    store.getState().resolveDrop(new Set(["a"]), "overwrite");

    expect(clipsById(store).get("l")).toEqual(locked);
  });

  it("a locked clip in the selection does not set the insert point", () => {
    const store = createTimelineStore();
    const v1 = makeTrack({ type: "video", locked: false });
    const v2 = makeTrack({ type: "video" });
    const v3 = makeTrack({ type: "video" });
    const locked = makeClip({
      id: "l",
      trackId: v1.id,
      startMs: 0,
      durationMs: 4000,
      locked: true
    });
    const moved = makeClip({ id: "a", trackId: v2.id, startMs: 11000, durationMs: 4000 });
    const other = makeClip({ id: "u", trackId: v3.id, startMs: 6000, durationMs: 1000 });
    store.setState({ tracks: [v1, v2, v3], clips: [locked, moved, other] });

    store.getState().resolveDrop(new Set(["l", "a"]), "insert");

    expect(clipsById(store).get("u")?.startMs).toBe(6000);
  });
});

describe("duplicates", () => {
  it("Duplicate keeps an imported clip's media", async () => {
    const store = createTimelineStore();
    const v1 = makeTrack({ type: "video" });
    const version = makeClipVersion({ id: "v", assetId: "asset-1" });
    const imported = makeClip({
      id: "src",
      trackId: v1.id,
      durationMs: 2000,
      sourceType: "imported",
      status: "generated",
      currentAssetId: "asset-1",
      versions: [version]
    });
    store.setState({ tracks: [v1], clips: [imported] });

    const copyId = await store.getState().duplicateClip("src");
    const copy = clipsById(store).get(copyId)!;

    expect(copy.currentAssetId).toBe("asset-1");
    expect(copy.status).toBe("generated");
    expect(copy.versions).toEqual([version]);
  });

  it("Duplicate and Regenerate as new clip refuse a locked track", async () => {
    const store = createTimelineStore();
    const v1 = makeTrack({ type: "video", locked: true });
    const clip = makeClip({ id: "src", trackId: v1.id, durationMs: 2000 });
    store.setState({ tracks: [v1], clips: [clip] });

    await expect(store.getState().duplicateClip("src")).rejects.toThrow(
      /Unlock the track/
    );
    expect(() => store.getState().regenerateAsCopy("src")).toThrow(
      /Unlock the track/
    );
    expect(store.getState().clips).toHaveLength(1);
  });

  it("Regenerate as new clip does not join the source's link group", () => {
    const store = createTimelineStore();
    const v1 = makeTrack({ type: "video" });
    const a1 = makeTrack({ type: "audio" });
    const video = makeClip({
      id: "v",
      trackId: v1.id,
      durationMs: 3000,
      linkId: "L",
      animations: [
        { id: "anim", role: "in", preset: "fade", durationMs: 300, enabled: true }
      ]
    });
    const audio = makeClip({
      id: "a",
      trackId: a1.id,
      durationMs: 3000,
      mediaType: "audio",
      linkId: "L"
    });
    store.setState({ tracks: [v1, a1], clips: [video, audio] });

    const copyId = store.getState().regenerateAsCopy("v");
    const copy = clipsById(store).get(copyId)!;

    expect(copy.linkId).toBeUndefined();
    expect(copy.animations?.[0]?.id).not.toBe("anim");
  });

  it("Ctrl+D on a group copies its children", () => {
    const store = createTimelineStore();
    const v1 = makeTrack({ type: "video" });
    const group = makeClip({
      id: "g",
      trackId: v1.id,
      mediaType: "group",
      startMs: 0,
      durationMs: 2000
    });
    const child = makeClip({
      id: "c",
      trackId: v1.id,
      parentId: "g",
      startMs: 0,
      durationMs: 2000
    });
    store.setState({ tracks: [v1], clips: [group, child] });

    const newIds = store.getState().duplicateSelected(new Set(["g"]));
    const copies = store
      .getState()
      .clips.filter((c) => newIds.includes(c.id));
    const groupCopy = copies.find((c) => c.mediaType === "group")!;

    expect(copies).toHaveLength(2);
    expect(copies.find((c) => c.mediaType !== "group")?.parentId).toBe(
      groupCopy.id
    );
  });
});

describe("splitSelectedAtPlayhead", () => {
  it("returns the right halves so the selection can follow them", () => {
    const store = createTimelineStore();
    const v1 = makeTrack({ type: "video" });
    const v2 = makeTrack({ type: "video" });
    const a = makeClip({ id: "a", trackId: v1.id, startMs: 0, durationMs: 10000 });
    const b = makeClip({ id: "b", trackId: v2.id, startMs: 0, durationMs: 10000 });
    store.setState({ tracks: [v1, v2], clips: [a, b] });

    const rightHalves = store
      .getState()
      .splitSelectedAtPlayhead(3000, new Set(["a"]));

    expect(rightHalves).toHaveLength(1);
    const right = clipsById(store).get(rightHalves[0])!;
    expect(right.trackId).toBe(v1.id);
    expect(right.startMs).toBe(3000);

    // The next S on the returned selection cuts only that clip again.
    store.getState().splitSelectedAtPlayhead(6000, new Set(rightHalves));
    expect(
      store.getState().clips.filter((c) => c.trackId === v2.id)
    ).toEqual([b]);
  });
});

describe("lock checks", () => {
  function lockedClipStore(clip: Partial<TimelineClip>) {
    const store = createTimelineStore();
    const track = makeTrack({ type: clip.mediaType === "midi" ? "midi" : "video" });
    const locked = makeClip({
      id: "x",
      trackId: track.id,
      durationMs: 2000,
      locked: true,
      ...clip
    });
    store.setState({ tracks: [track], clips: [locked] });
    return { store, locked, track };
  }

  it("fades, keyframes, replace output and unlink skip a locked clip", () => {
    const { store, locked } = lockedClipStore({
      fadeInMs: 200,
      fadeOutMs: 200,
      currentAssetId: "old",
      linkId: "L"
    });

    store.getState().clearFades(new Set(["x"]));
    store.getState().setClipKeyframe("x", "opacity", 500, 0.5);
    store.getState().replaceClipOutput("x", "new");
    store.getState().unlinkClip("x");

    expect(clipsById(store).get("x")).toEqual(locked);
  });

  it("a take swap on a locked track is refused with a reason", () => {
    const store = createTimelineStore();
    const track = makeTrack({ type: "video", locked: true });
    const clip = makeClip({
      id: "x",
      trackId: track.id,
      durationMs: 2000,
      currentAssetId: "a1",
      versions: [
        makeClipVersion({ id: "t1", assetId: "a1" }),
        makeClipVersion({ id: "t2", assetId: "a2" })
      ]
    });
    store.setState({ tracks: [track], clips: [clip] });

    expect(store.getState().applyTake("x", "t2")).toMatch(/Unlock the track/);
    expect(clipsById(store).get("x")?.currentAssetId).toBe("a1");
  });

  it("MIDI note and instrument edits skip a locked clip and track", () => {
    const { store, track } = lockedClipStore({
      mediaType: "midi",
      notes: [{ id: "n", pitch: 60, startTick: 0, durationTick: 480, velocity: 100 }]
    });
    store.setState({
      tracks: [{ ...track, locked: true }]
    });
    const before = store.getState();

    store.getState().setClipNotes("x", []);
    store.getState().transposeClip("x", 12);
    store
      .getState()
      .setTrackInstrument(track.id, { type: "subtractive", name: "Saw" } as never);

    expect(store.getState().clips).toBe(before.clips);
    expect(store.getState().tracks).toBe(before.tracks);
  });
});

describe("setClipNotes", () => {
  function midiStore() {
    const store = createTimelineStore();
    const track = makeTrack({ type: "midi" });
    const clip = makeClip({
      id: "m",
      trackId: track.id,
      mediaType: "midi",
      durationMs: 4000,
      notes: [{ id: "n", pitch: 60, startTick: 0, durationTick: 480, velocity: 100 }]
    });
    store.setState({ tracks: [track], clips: [clip] });
    timelineTemporalOf(store).clear();
    return store;
  }

  it("refuses more notes than a clip may save", () => {
    const store = midiStore();
    const notes = Array.from({ length: MIDI_MAX_NOTES_PER_CLIP + 1 }, (_, i) => ({
      pitch: 60,
      startTick: i * 10,
      durationTick: 10,
      velocity: 100
    }));

    store.getState().setClipNotes("m", notes);

    expect(clipsById(store).get("m")?.notes).toHaveLength(1);
  });

  it("an unchanged note list adds no undo entry", () => {
    const store = midiStore();
    const notes = clipsById(store).get("m")!.notes!;

    store.getState().setClipNotes("m", notes);

    expect(timelineTemporalOf(store).pastStates).toHaveLength(0);
  });
});

describe("setClipSpeed", () => {
  it("refuses a time-remapped clip", () => {
    const store = createTimelineStore();
    const track = makeTrack({ type: "video" });
    const clip = makeClip({
      id: "r",
      trackId: track.id,
      durationMs: 4000,
      timeRemap: {
        keyframes: [
          { t: 0, sourceMs: 0 },
          { t: 0.5, sourceMs: 2000 },
          { t: 1, sourceMs: 2000 }
        ]
      }
    } as Partial<TimelineClip>);
    store.setState({ tracks: [track], clips: [clip] });

    store.getState().setClipSpeed("r", 2);

    expect(clipsById(store).get("r")).toEqual(clip);
  });

  it("stretches caption words with the clip", () => {
    const store = createTimelineStore();
    const track = makeTrack({ type: "audio" });
    const clip = makeClip({
      id: "s",
      trackId: track.id,
      mediaType: "audio",
      durationMs: 2000,
      caption: {
        words: [
          { word: "hello", startMs: 0, endMs: 1000 },
          { word: "world", startMs: 1000, endMs: 2000 }
        ]
      }
    });
    store.setState({ tracks: [track], clips: [clip] });

    store.getState().setClipSpeed("s", 2);

    expect(clipsById(store).get("s")?.caption?.words[1]).toMatchObject({
      startMs: 500,
      endMs: 1000
    });
  });
});
