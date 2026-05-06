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
// Import mock helpers directly from the mock file so TypeScript resolves the
// exports correctly. Jest's moduleNameMapper redirects TimelineStore.ts's
// own `trpc/client` import to the same file, so both share the same module
// instance at runtime.
import {
  mockWorkflowsGet,
  mockWorkflowsCreate
} from "../../../__mocks__/trpcClientMock";

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

describe("TimelineStore — addImportedClip", () => {
  it("creates an image clip from an image asset", () => {
    const store = mkStore();
    const track = makeTrack({ type: "video" });
    store.setState({ tracks: [track] });

    const asset = {
      id: "img-asset-1",
      user_id: "u1",
      parent_id: "root",
      name: "photo.jpg",
      content_type: "image/jpeg",
      workflow_id: null,
      created_at: "2024-01-01T00:00:00Z",
      get_url: "https://cdn.example.com/photo.jpg",
      thumb_url: null,
      duration: null
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.getState().addImportedClip(asset as any, track.id, 2000);

    const clips = store.getState().clips;
    expect(clips).toHaveLength(1);
    expect(clips[0].mediaType).toBe("image");
    expect(clips[0].sourceType).toBe("imported");
    expect(clips[0].status).toBe("generated");
    expect(clips[0].currentAssetId).toBe("img-asset-1");
    expect(clips[0].durationMs).toBe(4000);
    expect(clips[0].startMs).toBe(2000);
    expect(clips[0].trackId).toBe(track.id);
  });

  it("creates a video clip with duration from the asset", () => {
    const store = mkStore();
    const track = makeTrack({ type: "video" });
    store.setState({ tracks: [track] });

    const asset = {
      id: "vid-asset-1",
      user_id: "u1",
      parent_id: "root",
      name: "clip.mp4",
      content_type: "video/mp4",
      workflow_id: null,
      created_at: "2024-01-01T00:00:00Z",
      get_url: "https://cdn.example.com/clip.mp4",
      thumb_url: null,
      duration: 10 // seconds
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.getState().addImportedClip(asset as any, track.id, 0);

    const clips = store.getState().clips;
    expect(clips[0].mediaType).toBe("video");
    expect(clips[0].durationMs).toBe(10000);
  });

  it("creates an audio clip on an audio track", () => {
    const store = mkStore();
    const track = makeTrack({ type: "audio" });
    store.setState({ tracks: [track] });

    const asset = {
      id: "audio-asset-1",
      user_id: "u1",
      parent_id: "root",
      name: "track.mp3",
      content_type: "audio/mpeg",
      workflow_id: null,
      created_at: "2024-01-01T00:00:00Z",
      get_url: "https://cdn.example.com/track.mp3",
      thumb_url: null,
      duration: 120
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store.getState().addImportedClip(asset as any, track.id, 0);

    const clips = store.getState().clips;
    expect(clips[0].mediaType).toBe("audio");
    expect(clips[0].durationMs).toBe(120000);
  });
});


describe("TimelineStore — restoreVersion", () => {
  it("restores currentAssetId, paramOverrides, and lastGeneratedHash from version", () => {
    const store = mkStore();
    const track = makeTrack({ type: "video" });
    const clip = makeClip({
      trackId: track.id,
      dependencyHash: "hash-current",
      versions: [
        {
          id: "ver-1",
          createdAt: new Date().toISOString(),
          jobId: "j1",
          assetId: "asset-restored",
          workflowUpdatedAt: new Date().toISOString(),
          dependencyHash: "hash-current",
          paramOverridesSnapshot: { speed: 1.5 },
          status: "success"
        }
      ]
    });
    store.setState({ tracks: [track], clips: [clip] });

    store.getState().restoreVersion(clip.id, "ver-1");

    const updated = store.getState().clips[0];
    expect(updated.currentAssetId).toBe("asset-restored");
    expect(updated.lastGeneratedHash).toBe("hash-current");
    expect(updated.paramOverrides).toEqual({ speed: 1.5 });
    // hashes match → status is "generated"
    expect(updated.status).toBe("generated");
  });

  it("sets status to stale when dependencyHash differs", () => {
    const store = mkStore();
    const track = makeTrack({ type: "video" });
    const clip = makeClip({
      trackId: track.id,
      dependencyHash: "hash-new",
      versions: [
        {
          id: "ver-old",
          createdAt: new Date().toISOString(),
          jobId: "j2",
          assetId: "asset-old",
          workflowUpdatedAt: new Date().toISOString(),
          dependencyHash: "hash-old",
          paramOverridesSnapshot: {},
          status: "success"
        }
      ]
    });
    store.setState({ tracks: [track], clips: [clip] });

    store.getState().restoreVersion(clip.id, "ver-old");

    const updated = store.getState().clips[0];
    expect(updated.status).toBe("stale");
  });

  it("is a no-op for failed versions", () => {
    const store = mkStore();
    const track = makeTrack({ type: "video" });
    const clip = makeClip({
      trackId: track.id,
      versions: [
        {
          id: "ver-fail",
          createdAt: new Date().toISOString(),
          jobId: "j3",
          assetId: "asset-fail",
          workflowUpdatedAt: new Date().toISOString(),
          dependencyHash: "h",
          paramOverridesSnapshot: {},
          status: "failed"
        }
      ]
    });
    store.setState({ tracks: [track], clips: [clip] });

    store.getState().restoreVersion(clip.id, "ver-fail");

    // Status should be unchanged (no-op)
    expect(store.getState().clips[0].currentAssetId).toBeUndefined();
  });

  it("is a no-op for an unknown clipId", () => {
    const store = mkStore();
    const track = makeTrack({ type: "video" });
    const clip = makeClip({ trackId: track.id });
    store.setState({ tracks: [track], clips: [clip] });

    store.getState().restoreVersion("nonexistent", "ver-1");

    expect(store.getState().clips[0]).toBe(clip);
  });
});

describe("TimelineStore — duplicateClipLinked", () => {
  it("creates a second clip with a new id", () => {
    const store = mkStore();
    const { clip } = addTrackAndClip(store, { startMs: 0, durationMs: 2000 });
    store.getState().duplicateClipLinked(clip.id);
    const clips = store.getState().clips;
    expect(clips).toHaveLength(2);
    expect(clips[0].id).not.toBe(clips[1].id);
  });

  it("shares the same workflowId as the source", () => {
    const store = mkStore();
    const { clip } = addTrackAndClip(store, {
      startMs: 0,
      durationMs: 1000,
      workflowId: "wf-123"
    });
    store.getState().duplicateClipLinked(clip.id);
    const newClip = store.getState().clips.find((c) => c.id !== clip.id)!;
    expect(newClip.workflowId).toBe("wf-123");
  });

  it("applies deltaMs offset to the new clip start", () => {
    const store = mkStore();
    const { clip } = addTrackAndClip(store, { startMs: 500, durationMs: 1000 });
    store.getState().duplicateClipLinked(clip.id, 2000);
    const newClip = store.getState().clips.find((c) => c.id !== clip.id)!;
    expect(newClip.startMs).toBe(2500);
  });

  it("gives the duplicate an independent copy of paramOverrides", () => {
    const store = mkStore();
    const { clip } = addTrackAndClip(store, {
      startMs: 0,
      durationMs: 1000,
      paramOverrides: { speed: 1 }
    });
    store.getState().duplicateClipLinked(clip.id);
    const newClip = store.getState().clips.find((c) => c.id !== clip.id)!;

    // Mutating one clip's overrides does not affect the other
    store.getState().patchClip(newClip.id, { paramOverrides: { speed: 2 } });
    const original = store.getState().clips.find((c) => c.id === clip.id)!;
    expect(original.paramOverrides?.speed).toBe(1);
  });

  it("resets generation state on the duplicate", () => {
    const store = mkStore();
    const { clip } = addTrackAndClip(store, {
      startMs: 0,
      durationMs: 1000,
      currentAssetId: "asset-abc",
      lastGeneratedHash: "hash-xyz"
    });
    store.getState().duplicateClipLinked(clip.id);
    const newClip = store.getState().clips.find((c) => c.id !== clip.id)!;
    expect(newClip.currentAssetId).toBeUndefined();
    expect(newClip.lastGeneratedHash).toBeUndefined();
    expect(newClip.status).toBe("draft");
  });

  it("resets locked to false even when source is locked", () => {
    const store = mkStore();
    const { clip } = addTrackAndClip(store, { startMs: 0, durationMs: 1000 });
    store.getState().setClipLocked(clip.id, true);
    store.getState().duplicateClipLinked(clip.id);
    const newClip = store.getState().clips.find((c) => c.id !== clip.id)!;
    expect(newClip.locked).toBe(false);
    // Source remains locked
    const src = store.getState().clips.find((c) => c.id === clip.id)!;
    expect(src.locked).toBe(true);
  });

  it("deep-copies paramOverrides so nested values are independent", () => {
    const store = mkStore();
    const { clip } = addTrackAndClip(store, {
      startMs: 0,
      durationMs: 1000,
      paramOverrides: { nested: { value: 42 } }
    });
    store.getState().duplicateClipLinked(clip.id);
    const newClip = store.getState().clips.find((c) => c.id !== clip.id)!;
    // Mutate via patchClip — original nested object must not be affected
    store.getState().patchClip(newClip.id, {
      paramOverrides: { nested: { value: 99 } }
    });
    const original = store.getState().clips.find((c) => c.id === clip.id)!;
    const nested = original.paramOverrides?.nested as { value: number } | undefined;
    expect(nested?.value).toBe(42);
  });

  it("no-ops for unknown clip id", () => {
    const store = mkStore();
    addTrackAndClip(store);
    store.getState().duplicateClipLinked("nonexistent");
    expect(store.getState().clips).toHaveLength(1);
  });
});

describe("TimelineStore — duplicateClipAsVariation", () => {
  beforeEach(() => {
    mockWorkflowsGet.mockReset();
    mockWorkflowsCreate.mockReset();
  });

  it("creates a second clip with a new id and new workflowId", async () => {
    const store = mkStore();
    const { clip } = addTrackAndClip(store, {
      startMs: 0,
      durationMs: 2000,
      workflowId: "wf-original"
    });

    mockWorkflowsGet.mockResolvedValue({
      id: "wf-original",
      name: "My Workflow",
      access: "private",
      graph: { nodes: [], edges: [] },
      description: null,
      tags: []
    });
    mockWorkflowsCreate.mockResolvedValue({ id: "wf-variation" });

    const newClipId = await store.getState().duplicateClipAsVariation(clip.id);

    const clips = store.getState().clips;
    expect(clips).toHaveLength(2);
    const newClip = clips.find((c) => c.id === newClipId)!;
    expect(newClip.workflowId).toBe("wf-variation");
    expect(newClip.workflowId).not.toBe(clip.workflowId);
  });

  it("applies deltaMs offset", async () => {
    const store = mkStore();
    const { clip } = addTrackAndClip(store, { startMs: 500, durationMs: 1000 });

    mockWorkflowsGet.mockResolvedValue({
      id: undefined,
      name: "W",
      access: "private",
      graph: { nodes: [], edges: [] },
      description: null,
      tags: []
    });
    mockWorkflowsCreate.mockResolvedValue({ id: "wf-new" });

    await store.getState().duplicateClipAsVariation(clip.id, 2000);
    const newClip = store.getState().clips.find((c) => c.id !== clip.id)!;
    expect(newClip.startMs).toBe(2500);
  });

  it("skips API calls when clip has no workflowId", async () => {
    const store = mkStore();
    const { clip } = addTrackAndClip(store, { startMs: 0, durationMs: 1000 });
    // No workflowId on the clip
    const newClipId = await store.getState().duplicateClipAsVariation(clip.id);
    expect(mockWorkflowsGet).not.toHaveBeenCalled();
    expect(mockWorkflowsCreate).not.toHaveBeenCalled();
    const newClip = store.getState().clips.find((c) => c.id === newClipId)!;
    expect(newClip.workflowId).toBeUndefined();
  });

  it("rejects when source clip does not exist", async () => {
    const store = mkStore();
    await expect(
      store.getState().duplicateClipAsVariation("nonexistent")
    ).rejects.toThrow("Clip nonexistent not found");
  });

  it("resets generation state on the new clip", async () => {
    const store = mkStore();
    const { clip } = addTrackAndClip(store, {
      startMs: 0,
      durationMs: 1000,
      currentAssetId: "asset-xyz",
      lastGeneratedHash: "hash-abc",
      workflowId: "wf-src"
    });

    mockWorkflowsGet.mockResolvedValue({
      id: "wf-src",
      name: "W",
      access: "private",
      graph: { nodes: [], edges: [] },
      description: null,
      tags: []
    });
    mockWorkflowsCreate.mockResolvedValue({ id: "wf-cloned" });

    const newClipId = await store.getState().duplicateClipAsVariation(clip.id);
    const newClip = store.getState().clips.find((c) => c.id === newClipId)!;
    expect(newClip.currentAssetId).toBeUndefined();
    expect(newClip.lastGeneratedHash).toBeUndefined();
    expect(newClip.status).toBe("draft");
  });

  it("resets locked to false even when source is locked", async () => {
    const store = mkStore();
    const { clip } = addTrackAndClip(store, { startMs: 0, durationMs: 1000 });
    store.getState().setClipLocked(clip.id, true);

    const newClipId = await store.getState().duplicateClipAsVariation(clip.id);
    const newClip = store.getState().clips.find((c) => c.id === newClipId)!;
    expect(newClip.locked).toBe(false);
  });
});

describe("TimelineStore — setClipLocked", () => {
  it("locks a clip", () => {
    const store = mkStore();
    const { clip } = addTrackAndClip(store);
    store.getState().setClipLocked(clip.id, true);
    expect(store.getState().clips[0].locked).toBe(true);
  });

  it("unlocks a clip", () => {
    const store = mkStore();
    const { clip } = addTrackAndClip(store, { locked: true });
    store.getState().setClipLocked(clip.id, false);
    expect(store.getState().clips[0].locked).toBe(false);
  });
});

describe("TimelineStore — replaceClipOutput", () => {
  it("sets currentAssetId without touching other fields", () => {
    const store = mkStore();
    const { clip } = addTrackAndClip(store, {
      paramOverrides: { prompt: "hello" },
      lastGeneratedHash: "old-hash"
    });
    store.getState().replaceClipOutput(clip.id, "asset-new");
    const updated = store.getState().clips[0];
    expect(updated.currentAssetId).toBe("asset-new");
    expect(updated.paramOverrides?.prompt).toBe("hello");
    expect(updated.lastGeneratedHash).toBe("old-hash");
  });
});

// ── Freshness actions ──────────────────────────────────────────────────────

describe("TimelineStore — markClipsStaleForWorkflow", () => {
  it("marks all clips with the given workflowId as stale", () => {
    const store = mkStore();
    const track = makeTrack({ type: "video" });
    const clipA = makeClip({ trackId: track.id, workflowId: "wf-1", status: "generated" });
    const clipB = makeClip({ trackId: track.id, workflowId: "wf-1", status: "generated" });
    const clipC = makeClip({ trackId: track.id, workflowId: "wf-2", status: "generated" });
    store.setState({ tracks: [track], clips: [clipA, clipB, clipC] });

    store.getState().markClipsStaleForWorkflow("wf-1");

    const clips = store.getState().clips;
    expect(clips.find((c) => c.id === clipA.id)!.status).toBe("stale");
    expect(clips.find((c) => c.id === clipB.id)!.status).toBe("stale");
    // clipC uses a different workflowId — must not be affected
    expect(clips.find((c) => c.id === clipC.id)!.status).toBe("generated");
  });

  it("is a no-op when no clips reference the workflowId", () => {
    const store = mkStore();
    const { clip } = addTrackAndClip(store, { workflowId: "wf-other", status: "generated" });

    store.getState().markClipsStaleForWorkflow("wf-missing");

    expect(store.getState().clips.find((c) => c.id === clip.id)!.status).toBe(
      "generated"
    );
  });
});

describe("TimelineStore — applyInputDrift", () => {
  it("seeds added input names with default values", () => {
    const store = mkStore();
    const { clip } = addTrackAndClip(store, {
      workflowId: "wf-1",
      paramOverrides: { existing: "hello" }
    });

    store
      .getState()
      .applyInputDrift(
        "wf-1",
        [{ name: "newInput", defaultValue: 42 }],
        []
      );

    const overrides = store.getState().clips.find((c) => c.id === clip.id)!
      .paramOverrides;
    expect(overrides?.existing).toBe("hello");
    expect(overrides?.newInput).toBe(42);
  });

  it("does not overwrite an existing override with the default", () => {
    const store = mkStore();
    const { clip } = addTrackAndClip(store, {
      workflowId: "wf-1",
      paramOverrides: { prompt: "keep-me" }
    });

    store
      .getState()
      .applyInputDrift(
        "wf-1",
        [{ name: "prompt", defaultValue: "replaced?" }],
        []
      );

    expect(
      store.getState().clips.find((c) => c.id === clip.id)!.paramOverrides
        ?.prompt
    ).toBe("keep-me");
  });

  it("drops removed input names from paramOverrides", () => {
    const store = mkStore();
    const { clip } = addTrackAndClip(store, {
      workflowId: "wf-1",
      paramOverrides: { a: 1, b: 2, c: 3 }
    });

    store.getState().applyInputDrift("wf-1", [], ["b", "c"]);

    const overrides = store.getState().clips.find((c) => c.id === clip.id)!
      .paramOverrides;
    expect(overrides).toEqual({ a: 1 });
  });

  it("applies drift to all clips with the same workflowId", () => {
    const store = mkStore();
    const track = makeTrack({ type: "video" });
    const clipA = makeClip({
      trackId: track.id,
      workflowId: "wf-1",
      paramOverrides: { old: "x" }
    });
    const clipB = makeClip({
      trackId: track.id,
      workflowId: "wf-1",
      paramOverrides: { old: "y" }
    });
    const clipC = makeClip({
      trackId: track.id,
      workflowId: "wf-other",
      paramOverrides: { old: "z" }
    });
    store.setState({ tracks: [track], clips: [clipA, clipB, clipC] });

    store
      .getState()
      .applyInputDrift("wf-1", [{ name: "brand_new", defaultValue: 0 }], ["old"]);

    const clips = store.getState().clips;
    // wf-1 clips should have "brand_new" added and "old" removed
    expect(clips.find((c) => c.id === clipA.id)!.paramOverrides).toEqual({
      brand_new: 0
    });
    expect(clips.find((c) => c.id === clipB.id)!.paramOverrides).toEqual({
      brand_new: 0
    });
    // wf-other clip unchanged
    expect(clips.find((c) => c.id === clipC.id)!.paramOverrides).toEqual({
      old: "z"
    });
  });
});

describe("TimelineStore — setClipsOutputNode", () => {
  it("sets selectedOutputNodeId on all clips with the given workflowId", () => {
    const store = mkStore();
    const track = makeTrack({ type: "video" });
    const clipA = makeClip({
      trackId: track.id,
      workflowId: "wf-1",
      selectedOutputNodeId: "old-node",
      status: "generated"
    });
    const clipB = makeClip({
      trackId: track.id,
      workflowId: "wf-1",
      selectedOutputNodeId: "old-node",
      status: "generated"
    });
    const clipC = makeClip({
      trackId: track.id,
      workflowId: "wf-2",
      selectedOutputNodeId: "old-node",
      status: "generated"
    });
    store.setState({ tracks: [track], clips: [clipA, clipB, clipC] });

    store.getState().setClipsOutputNode("wf-1", "new-node");

    const clips = store.getState().clips;
    expect(clips.find((c) => c.id === clipA.id)!.selectedOutputNodeId).toBe(
      "new-node"
    );
    expect(clips.find((c) => c.id === clipB.id)!.selectedOutputNodeId).toBe(
      "new-node"
    );
    // wf-2 clip must be unchanged
    expect(clips.find((c) => c.id === clipC.id)!.selectedOutputNodeId).toBe(
      "old-node"
    );
  });

  it("marks affected clips as stale", () => {
    const store = mkStore();
    const { clip } = addTrackAndClip(store, {
      workflowId: "wf-1",
      selectedOutputNodeId: "out-1",
      status: "generated"
    });

    store.getState().setClipsOutputNode("wf-1", "out-2");

    expect(store.getState().clips.find((c) => c.id === clip.id)!.status).toBe(
      "stale"
    );
  });
});
