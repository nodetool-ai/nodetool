import { describe, it, expect } from "@jest/globals";
import { createTimelineStore } from "../TimelineStore";
import { makeClip } from "@nodetool-ai/timeline";

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

describe("moveSelectedClips link-aware (FIX 1)", () => {
  it("keeps a linked sibling outside the selection following the move", () => {
    const { store, videoId, audioId } = storeWithLinkedPair();
    // Add a second, unrelated clip so the selection has 2 members but the
    // linked audio is NOT in the selection.
    const otherTrackId = store.getState().tracks[0].id;
    const other = makeClip({
      trackId: otherTrackId,
      mediaType: "video",
      startMs: 8000,
      durationMs: 2000,
      status: "generated"
    });
    store.getState().addClips([other]);

    const selected = new Set([videoId, other.id]);
    store
      .getState()
      .moveSelectedClips(videoId, selected, 500, undefined, undefined, undefined, true);

    const clips = store.getState().clips;
    expect(clips.find((c) => c.id === videoId)?.startMs).toBe(1500);
    expect(clips.find((c) => c.id === other.id)?.startMs).toBe(8500);
    // The linked audio (not selected) must follow by the same delta.
    expect(clips.find((c) => c.id === audioId)?.startMs).toBe(1500);
  });

  it("moves a linked sibling even for a single-clip selection (arrow nudge)", () => {
    const { store, videoId, audioId } = storeWithLinkedPair();
    const selected = new Set([videoId]);
    store
      .getState()
      .moveSelectedClips(videoId, selected, 250, undefined, undefined, undefined, true);

    const clips = store.getState().clips;
    expect(clips.find((c) => c.id === videoId)?.startMs).toBe(1250);
    expect(clips.find((c) => c.id === audioId)?.startMs).toBe(1250);
  });

  it("does not double-shift a sibling that is itself selected", () => {
    const { store, videoId, audioId } = storeWithLinkedPair();
    const selected = new Set([videoId, audioId]);
    store
      .getState()
      .moveSelectedClips(videoId, selected, 300, undefined, undefined, undefined, true);

    const clips = store.getState().clips;
    expect(clips.find((c) => c.id === videoId)?.startMs).toBe(1300);
    expect(clips.find((c) => c.id === audioId)?.startMs).toBe(1300);
  });
});

describe("deleteSelected link-aware (FIX 2)", () => {
  it("unlinks the lone survivor when one member is deleted", () => {
    const { store, videoId, audioId } = storeWithLinkedPair();
    store.getState().deleteSelected(new Set([videoId]));
    const clips = store.getState().clips;
    expect(clips.find((c) => c.id === videoId)).toBeUndefined();
    expect(clips.find((c) => c.id === audioId)?.linkId).toBeUndefined();
  });
});

describe("duplicate remaps linkId (FIX 3)", () => {
  it("duplicateSelected gives both copies a NEW shared linkId, distinct from originals", () => {
    const { store, videoId, audioId } = storeWithLinkedPair();
    const newIds = store.getState().duplicateSelected(new Set([videoId, audioId]));
    expect(newIds).toHaveLength(2);
    const clips = store.getState().clips;
    const copies = newIds.map((id) => clips.find((c) => c.id === id)!);
    const copyLink = copies[0].linkId;
    expect(copyLink).toBeDefined();
    // Both copies share one link id.
    expect(copies[1].linkId).toBe(copyLink);
    // New group id is distinct from the originals' "lnk-1".
    expect(copyLink).not.toBe("lnk-1");
    // Originals keep their link.
    expect(clips.find((c) => c.id === videoId)?.linkId).toBe("lnk-1");
    expect(clips.find((c) => c.id === audioId)?.linkId).toBe("lnk-1");
  });

  it("duplicateSelected on a lone half gives the copy no linkId", () => {
    const { store, videoId } = storeWithLinkedPair();
    const newIds = store.getState().duplicateSelected(new Set([videoId]));
    expect(newIds).toHaveLength(1);
    const copy = store.getState().clips.find((c) => c.id === newIds[0]);
    expect(copy?.linkId).toBeUndefined();
  });

  it("duplicateClip gives the copy no linkId", async () => {
    const { store, videoId } = storeWithLinkedPair();
    const newId = await store.getState().duplicateClip(videoId);
    const copy = store.getState().clips.find((c) => c.id === newId);
    expect(copy?.linkId).toBeUndefined();
    // Original keeps its link.
    expect(store.getState().clips.find((c) => c.id === videoId)?.linkId).toBe(
      "lnk-1"
    );
  });
});

describe("split link-aware (FIX 4)", () => {
  it("splitClipAtTime splits the linked sibling too, forming two new pairs", () => {
    const { store, videoId } = storeWithLinkedPair();
    // Both clips span 1000..6000; split at 3000 (inside both).
    store.getState().splitClipAtTime(videoId, 3000);
    const clips = store.getState().clips;
    expect(clips).toHaveLength(4);

    const leftVideo = clips.find(
      (c) => c.mediaType === "video" && c.startMs === 1000
    )!;
    const rightVideo = clips.find(
      (c) => c.mediaType === "video" && c.startMs === 3000
    )!;
    const leftAudio = clips.find(
      (c) => c.mediaType === "audio" && c.startMs === 1000
    )!;
    const rightAudio = clips.find(
      (c) => c.mediaType === "audio" && c.startMs === 3000
    )!;

    // Left video + left audio share one link id (A).
    const linkA = leftVideo.linkId;
    expect(linkA).toBeDefined();
    expect(leftAudio.linkId).toBe(linkA);

    // Right video + right audio share another link id (B).
    const linkB = rightVideo.linkId;
    expect(linkB).toBeDefined();
    expect(rightAudio.linkId).toBe(linkB);

    // A !== B !== original.
    expect(linkA).not.toBe(linkB);
    expect(linkA).not.toBe("lnk-1");
    expect(linkB).not.toBe("lnk-1");
  });

  it("splitSelectedAtPlayhead splits a linked sibling once (no double split)", () => {
    const { store, videoId, audioId } = storeWithLinkedPair();
    store
      .getState()
      .splitSelectedAtPlayhead(3000, new Set([videoId, audioId]));
    const clips = store.getState().clips;
    expect(clips).toHaveLength(4);
    const leftVideo = clips.find(
      (c) => c.mediaType === "video" && c.startMs === 1000
    )!;
    const leftAudio = clips.find(
      (c) => c.mediaType === "audio" && c.startMs === 1000
    )!;
    expect(leftVideo.linkId).toBe(leftAudio.linkId);
    const rightVideo = clips.find(
      (c) => c.mediaType === "video" && c.startMs === 3000
    )!;
    expect(rightVideo.linkId).not.toBe(leftVideo.linkId);
  });
});

describe("atomic linked trim (FIX 5)", () => {
  function storeWithMismatchedPair() {
    const store = createTimelineStore();
    const s = store.getState();
    s.addTrack("video", "Video 1");
    const videoTrackId = store.getState().tracks[0].id;
    const audioTrackId = s.getOrCreateAudioTrack();
    const video = makeClip({
      trackId: videoTrackId,
      mediaType: "video",
      startMs: 0,
      durationMs: 10000,
      inPointMs: 0,
      outPointMs: 10000,
      linkId: "lnk-m",
      status: "generated"
    });
    const audio = makeClip({
      trackId: audioTrackId,
      mediaType: "audio",
      startMs: 0,
      durationMs: 9500,
      inPointMs: 0,
      outPointMs: 9500,
      linkId: "lnk-m",
      status: "generated"
    });
    store.getState().addClips([video, audio]);
    return { store, videoId: video.id, audioId: audio.id };
  }

  it("aborts the whole trim when a linked sibling's trim is invalid", () => {
    const { store, videoId, audioId } = storeWithMismatchedPair();
    // trimClipEnd(delta) → durationMs + delta. A delta that's fine for the
    // 10000 video but makes the 9500 audio non-positive (e.g. -9700) must
    // abort entirely.
    store.getState().trimClipEnd(videoId, -9700);
    const clips = store.getState().clips;
    expect(clips.find((c) => c.id === videoId)?.durationMs).toBe(10000);
    expect(clips.find((c) => c.id === audioId)?.durationMs).toBe(9500);
  });

  it("aborts trimClipStart when a linked sibling's trim is invalid", () => {
    const { store, videoId, audioId } = storeWithMismatchedPair();
    // trimClip("start", delta) → durationMs + delta. -9700 shrinks the head
    // past the 9500 audio's end → invalid → abort both.
    store.getState().trimClipStart(videoId, -9700);
    const clips = store.getState().clips;
    expect(clips.find((c) => c.id === videoId)?.durationMs).toBe(10000);
    expect(clips.find((c) => c.id === audioId)?.durationMs).toBe(9500);
  });

  it("applies the trim to both when valid for both", () => {
    const { store, videoId, audioId } = storeWithMismatchedPair();
    store.getState().trimClipEnd(videoId, -1000);
    const clips = store.getState().clips;
    expect(clips.find((c) => c.id === videoId)?.durationMs).toBe(9000);
    expect(clips.find((c) => c.id === audioId)?.durationMs).toBe(8500);
  });
});
