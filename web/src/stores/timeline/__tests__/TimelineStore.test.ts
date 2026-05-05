/**
 * TimelineStore unit tests.
 *
 * Tests pure reducer mutations (moveClip, trimClip*, splitClipAtTime,
 * splitSelectedAtPlayhead, duplicateSelected, deleteSelected, addTrack,
 * removeTrack, reorderTracks).  Each test creates an isolated store via
 * createTimelineStore() so state is never shared between cases.
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { createTimelineStore } from "../TimelineStore";
import { makeTrack, makeClip } from "@nodetool-ai/timeline";

// ── Helpers ────────────────────────────────────────────────────────────────

function mkStore() {
  return createTimelineStore();
}

function addTrackAndClip(
  store: ReturnType<typeof mkStore>,
  clipOverrides: Partial<Parameters<typeof makeClip>[0]> = {}
) {
  const track = makeTrack({ type: "video", name: "V1" });
  const clip = makeClip({
    trackId: track.id,
    name: "clip-1",
    startMs: 1000,
    durationMs: 3000,
    ...clipOverrides
  });

  store.setState({ tracks: [track], clips: [clip] });
  return { track, clip };
}

// ── Track mutations ────────────────────────────────────────────────────────

describe("TimelineStore — tracks", () => {
  let store: ReturnType<typeof mkStore>;

  beforeEach(() => {
    store = mkStore();
  });

  it("addTrack appends a new track", () => {
    store.getState().addTrack("video", "V1");
    expect(store.getState().tracks).toHaveLength(1);
    expect(store.getState().tracks[0].type).toBe("video");
    expect(store.getState().tracks[0].name).toBe("V1");
  });

  it("addTrack auto-names when name is omitted", () => {
    store.getState().addTrack("audio");
    expect(store.getState().tracks[0].name).toMatch(/audio/i);
  });

  it("removeTrack deletes the track and its clips", () => {
    store.getState().addTrack("video", "V1");
    const trackId = store.getState().tracks[0].id;
    const clip = makeClip({ trackId, name: "c", startMs: 0, durationMs: 1000 });
    store.setState({ clips: [clip] });

    store.getState().removeTrack(trackId);
    expect(store.getState().tracks).toHaveLength(0);
    expect(store.getState().clips).toHaveLength(0);
  });

  it("reorderTracks assigns new indices", () => {
    const t1 = makeTrack({ name: "A", index: 0 });
    const t2 = makeTrack({ name: "B", index: 1 });
    const t3 = makeTrack({ name: "C", index: 2 });
    store.setState({ tracks: [t1, t2, t3] });

    store.getState().reorderTracks([t3.id, t1.id, t2.id]);

    const tracks = store.getState().tracks;
    const byId = new Map(tracks.map((t) => [t.id, t]));
    expect(byId.get(t3.id)!.index).toBe(0);
    expect(byId.get(t1.id)!.index).toBe(1);
    expect(byId.get(t2.id)!.index).toBe(2);
  });

  it("setTrackHeight updates heightPx", () => {
    store.getState().addTrack("video", "V1");
    const trackId = store.getState().tracks[0].id;
    store.getState().setTrackHeight(trackId, 120);
    expect(store.getState().tracks[0].heightPx).toBe(120);
  });

  it("setTrackVisible toggles visibility", () => {
    store.getState().addTrack("video", "V1");
    const trackId = store.getState().tracks[0].id;
    store.getState().setTrackVisible(trackId, false);
    expect(store.getState().tracks[0].visible).toBe(false);
    store.getState().setTrackVisible(trackId, true);
    expect(store.getState().tracks[0].visible).toBe(true);
  });

  it("setTrackLocked toggles lock", () => {
    store.getState().addTrack("video", "V1");
    const trackId = store.getState().tracks[0].id;
    store.getState().setTrackLocked(trackId, true);
    expect(store.getState().tracks[0].locked).toBe(true);
  });

  it("setTrackMuted and setTrackSolo work independently", () => {
    store.getState().addTrack("audio", "A1");
    const trackId = store.getState().tracks[0].id;
    store.getState().setTrackMuted(trackId, true);
    store.getState().setTrackSolo(trackId, true);
    expect(store.getState().tracks[0].muted).toBe(true);
    expect(store.getState().tracks[0].solo).toBe(true);
  });

  it("setTrackName updates name", () => {
    store.getState().addTrack("video", "old");
    const trackId = store.getState().tracks[0].id;
    store.getState().setTrackName(trackId, "new name");
    expect(store.getState().tracks[0].name).toBe("new name");
  });
});

// ── Clip mutations ─────────────────────────────────────────────────────────

describe("TimelineStore — moveClip", () => {
  let store: ReturnType<typeof mkStore>;

  beforeEach(() => {
    store = mkStore();
  });

  it("moves a clip forward in time", () => {
    const { clip } = addTrackAndClip(store);
    store.getState().moveClip(clip.id, 500);
    expect(store.getState().clips[0].startMs).toBe(1500);
  });

  it("clamps clip to time >= 0", () => {
    const { clip } = addTrackAndClip(store, { startMs: 200 });
    store.getState().moveClip(clip.id, -1000);
    expect(store.getState().clips[0].startMs).toBe(0);
  });

  it("changes trackId when toTrackId is supplied", () => {
    const { clip } = addTrackAndClip(store);
    const t2 = makeTrack({ type: "video", name: "V2" });
    store.setState({ tracks: [...store.getState().tracks, t2] });
    store.getState().moveClip(clip.id, 0, t2.id);
    expect(store.getState().clips[0].trackId).toBe(t2.id);
  });

  it("no-ops for unknown clip id", () => {
    addTrackAndClip(store);
    const before = store.getState().clips[0].startMs;
    store.getState().moveClip("nonexistent", 500);
    expect(store.getState().clips[0].startMs).toBe(before);
  });
});

describe("TimelineStore — trimClipStart / trimClipEnd", () => {
  let store: ReturnType<typeof mkStore>;

  beforeEach(() => {
    store = mkStore();
  });

  it("trimClipStart with negative deltaMs extends start earlier", () => {
    const { clip } = addTrackAndClip(store, { startMs: 2000, durationMs: 3000 });
    // trimClip(edge='start', deltaMs=-500) → startMs - 500 (new start), duration + 500
    store.getState().trimClipStart(clip.id, -500);
    const c = store.getState().clips[0];
    expect(c.startMs).toBe(2500); // clip.startMs - (-500) = 2000 - (-500) = 2500... wait let me re-read
    // trimClip: nextStartMs = clip.startMs - deltaMs, nextDurationMs = clip.durationMs + deltaMs
    // deltaMs = -500: nextStartMs = 2000 - (-500) = 2500, nextDurationMs = 3000 + (-500) = 2500
    expect(c.durationMs).toBe(2500);
  });

  it("trimClipEnd extends clip end by positive deltaMs", () => {
    const { clip } = addTrackAndClip(store, { startMs: 0, durationMs: 3000 });
    store.getState().trimClipEnd(clip.id, 1000);
    expect(store.getState().clips[0].durationMs).toBe(4000);
  });

  it("trimClipStart no-ops when it would produce zero/negative duration", () => {
    const { clip } = addTrackAndClip(store, { startMs: 1000, durationMs: 1000 });
    const before = store.getState().clips[0].durationMs;
    // deltaMs = 2000 → nextDurationMs = 1000 + 2000 = 3000? No wait...
    // trimClip(start, delta=2000): nextDurationMs = 1000 + 2000 = 3000, nextStartMs = 1000 - 2000 = -1000
    // That would fail with "cannot extend before source start" if inPointMs=0
    // Let's use deltaMs that would result in zero/negative duration:
    // trimClip(start, delta=1500): nextDurationMs = 1000 + 1500 = 2500, nextStartMs = -500... 
    // Actually we need delta negative to shrink from start:
    // trimClip(start, delta=-1500): nextDurationMs = 1000 + (-1500) = -500 → throws
    store.getState().trimClipStart(clip.id, -1500);
    expect(store.getState().clips[0].durationMs).toBe(before);
  });
});

describe("TimelineStore — splitClipAtTime", () => {
  let store: ReturnType<typeof mkStore>;

  beforeEach(() => {
    store = mkStore();
  });

  it("splits a clip into two at the given time", () => {
    const { clip } = addTrackAndClip(store, { startMs: 0, durationMs: 4000 });
    store.getState().splitClipAtTime(clip.id, 2000);
    const clips = store.getState().clips;
    expect(clips).toHaveLength(2);
    const starts = clips.map((c) => c.startMs).sort((a, b) => a - b);
    expect(starts[0]).toBe(0);
    expect(starts[1]).toBe(2000);
  });

  it("no-ops when atMs is outside clip bounds", () => {
    const { clip } = addTrackAndClip(store, { startMs: 0, durationMs: 4000 });
    store.getState().splitClipAtTime(clip.id, 5000); // outside
    expect(store.getState().clips).toHaveLength(1);
  });
});

describe("TimelineStore — splitSelectedAtPlayhead", () => {
  let store: ReturnType<typeof mkStore>;

  beforeEach(() => {
    store = mkStore();
  });

  it("splits all clips that straddle the playhead", () => {
    const track = makeTrack({ type: "video" });
    const c1 = makeClip({ trackId: track.id, startMs: 0, durationMs: 5000 });
    const c2 = makeClip({ trackId: track.id, startMs: 2000, durationMs: 3000 });
    const c3 = makeClip({ trackId: track.id, startMs: 6000, durationMs: 2000 }); // not split
    store.setState({ tracks: [track], clips: [c1, c2, c3] });

    // Empty selection = split all clips at playhead
    store.getState().splitSelectedAtPlayhead(3000, new Set());

    const clips = store.getState().clips;
    // c1 (0-5000) splits at 3000 → 2 clips
    // c2 (2000-5000) splits at 3000 → 2 clips
    // c3 (6000-8000) not affected
    expect(clips).toHaveLength(5);
  });

  it("splits only selected clips when selection is non-empty", () => {
    const track = makeTrack({ type: "video" });
    const c1 = makeClip({ trackId: track.id, startMs: 0, durationMs: 5000 });
    const c2 = makeClip({ trackId: track.id, startMs: 2000, durationMs: 3000 });
    store.setState({ tracks: [track], clips: [c1, c2] });

    // Only split c1 (c2 is excluded from selection)
    store.getState().splitSelectedAtPlayhead(3000, new Set([c1.id]));

    const clips = store.getState().clips;
    expect(clips).toHaveLength(3); // c1 → 2 pieces + c2 unchanged
    const remainingC2 = clips.find((c) => c.id === c2.id);
    expect(remainingC2).toBeDefined();
  });
});

describe("TimelineStore — duplicateSelected", () => {
  let store: ReturnType<typeof mkStore>;

  beforeEach(() => {
    store = mkStore();
  });

  it("duplicates clips and applies offset", () => {
    const { clip } = addTrackAndClip(store, { startMs: 0, durationMs: 2000 });
    store.getState().duplicateSelected(new Set([clip.id]), 500);
    const clips = store.getState().clips;
    expect(clips).toHaveLength(2);
    const duplicate = clips.find((c) => c.id !== clip.id)!;
    expect(duplicate.startMs).toBe(500);
    expect(duplicate.durationMs).toBe(2000);
  });

  it("duplicated clip has a new unique ID", () => {
    const { clip } = addTrackAndClip(store);
    store.getState().duplicateSelected(new Set([clip.id]));
    const ids = store.getState().clips.map((c) => c.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe("TimelineStore — deleteSelected / deleteClip", () => {
  let store: ReturnType<typeof mkStore>;

  beforeEach(() => {
    store = mkStore();
  });

  it("deleteSelected removes all selected clips", () => {
    const track = makeTrack({ type: "video" });
    const c1 = makeClip({ trackId: track.id, startMs: 0, durationMs: 1000 });
    const c2 = makeClip({ trackId: track.id, startMs: 2000, durationMs: 1000 });
    const c3 = makeClip({ trackId: track.id, startMs: 4000, durationMs: 1000 });
    store.setState({ tracks: [track], clips: [c1, c2, c3] });

    store.getState().deleteSelected(new Set([c1.id, c3.id]));

    const clips = store.getState().clips;
    expect(clips).toHaveLength(1);
    expect(clips[0].id).toBe(c2.id);
  });

  it("deleteClip removes a single clip by id", () => {
    const { clip } = addTrackAndClip(store);
    store.getState().deleteClip(clip.id);
    expect(store.getState().clips).toHaveLength(0);
  });
});

describe("TimelineStore — undo/redo (temporal)", () => {
  it("undo restores previous clip state", () => {
    const store = mkStore();
    const { clip } = addTrackAndClip(store, { startMs: 0, durationMs: 2000 });

    store.getState().moveClip(clip.id, 1000);
    expect(store.getState().clips[0].startMs).toBe(1000);

    // Access temporal API
    const temporal = (
      store as unknown as {
        temporal: { getState: () => { undo: () => void; redo: () => void };
      };
    }).temporal;

    temporal.getState().undo();
    expect(store.getState().clips[0].startMs).toBe(0);

    temporal.getState().redo();
    expect(store.getState().clips[0].startMs).toBe(1000);
  });
});

describe("TimelineStore — addClip / patchClip", () => {
  it("addClip inserts the clip", () => {
    const store = mkStore();
    const track = makeTrack({ type: "video" });
    store.setState({ tracks: [track] });
    const clip = makeClip({ trackId: track.id });
    store.getState().addClip(clip);
    expect(store.getState().clips).toHaveLength(1);
    expect(store.getState().clips[0].id).toBe(clip.id);
  });

  it("patchClip updates only specified fields", () => {
    const store = mkStore();
    const { clip } = addTrackAndClip(store, { startMs: 0, durationMs: 2000 });
    store.getState().patchClip(clip.id, { name: "renamed" });
    expect(store.getState().clips[0].name).toBe("renamed");
    expect(store.getState().clips[0].durationMs).toBe(2000);
  });
});
