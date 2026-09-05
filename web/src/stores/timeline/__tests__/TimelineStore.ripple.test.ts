import { describe, it, expect } from "@jest/globals";
import { createTimelineStore } from "../TimelineStore";
import { timelineTemporalOf } from "../TimelineStore";
import { makeClip } from "@nodetool-ai/timeline";

/** V1: a | b | c back to back; A1: vo under b. */
function storeWithCut() {
  const store = createTimelineStore();
  store.getState().addTrack("video", "Video 1");
  store.getState().addTrack("audio", "Audio 1");
  const [v1, a1] = store.getState().tracks.map((t) => t.id);
  const mk = (
    trackId: string,
    startMs: number,
    durationMs: number,
    inPointMs = 0
  ) =>
    makeClip({
      trackId,
      mediaType: trackId === a1 ? "audio" : "video",
      startMs,
      durationMs,
      inPointMs,
      outPointMs: inPointMs + durationMs,
      status: "generated"
    });
  const a = mk(v1, 0, 1000, 500);
  const b = mk(v1, 1000, 1000, 500);
  const c = mk(v1, 2000, 1000);
  const vo = mk(a1, 1200, 400);
  store.getState().addClips([a, b, c, vo]);
  const clip = (id: string) => store.getState().clips.find((x) => x.id === id)!;
  return { store, v1, a1, a, b, c, vo, clip };
}

describe("ripple trims", () => {
  it("rippleTrimClipEnd moves later clips on every track", () => {
    const { store, a, b, c, vo, clip } = storeWithCut();
    store.getState().rippleTrimClipEnd(a.id, -300);
    expect(clip(a.id).durationMs).toBe(700);
    expect(clip(b.id).startMs).toBe(700);
    expect(clip(c.id).startMs).toBe(1700);
    expect(clip(vo.id).startMs).toBe(900);
  });

  it("rippleTrimClipStart keeps the clip parked and moves its in point", () => {
    const { store, b, c, clip } = storeWithCut();
    store.getState().rippleTrimClipStart(b.id, -200);
    expect(clip(b.id).startMs).toBe(1000);
    expect(clip(b.id).inPointMs).toBe(700);
    expect(clip(b.id).durationMs).toBe(800);
    expect(clip(c.id).startMs).toBe(1800);
  });

  it("leaves a locked track alone", () => {
    const { store, a, a1, vo, c, clip } = storeWithCut();
    store.getState().setTrackLocked(a1, true);
    store.getState().rippleTrimClipEnd(a.id, -300);
    expect(clip(vo.id).startMs).toBe(1200);
    expect(clip(c.id).startMs).toBe(1700);
  });

  it("an invalid trim is a no-op", () => {
    const { store, a, b, clip } = storeWithCut();
    store.getState().rippleTrimClipEnd(a.id, -1000);
    expect(clip(a.id).durationMs).toBe(1000);
    expect(clip(b.id).startMs).toBe(1000);
  });
});

describe("rollClipEdge", () => {
  it("moves the cut and nothing downstream", () => {
    const { store, a, b, c, clip } = storeWithCut();
    store.getState().rollClipEdge(a.id, "end", 250);
    expect(clip(a.id).durationMs).toBe(1250);
    expect(clip(b.id).startMs).toBe(1250);
    expect(clip(b.id).inPointMs).toBe(750);
    expect(clip(b.id).durationMs).toBe(750);
    expect(clip(c.id).startMs).toBe(2000);
  });

  it("no-ops without a neighbour", () => {
    const { store, c, clip } = storeWithCut();
    store.getState().rollClipEdge(c.id, "end", 250);
    expect(clip(c.id).durationMs).toBe(1000);
  });
});

describe("rippleDeleteSelected", () => {
  it("removes the clips and closes their span in one undo step", () => {
    const { store, b, c, vo, clip } = storeWithCut();
    const before = store.getState().clips;
    store.getState().rippleDeleteSelected(new Set([b.id]));
    expect(store.getState().clips.find((x) => x.id === b.id)).toBeUndefined();
    expect(clip(c.id).startMs).toBe(1000);
    // vo started inside b's span, so it stays; only later starts move.
    expect(clip(vo.id).startMs).toBe(1200);
    timelineTemporalOf(store).undo();
    expect(store.getState().clips).toEqual(before);
  });

  it("drops the surviving half of a link group's linkId", () => {
    const { store, v1, a1 } = storeWithCut();
    const video = makeClip({
      trackId: v1,
      mediaType: "video",
      startMs: 5000,
      durationMs: 500,
      linkId: "L",
      status: "generated"
    });
    const audio = makeClip({
      trackId: a1,
      mediaType: "audio",
      startMs: 5000,
      durationMs: 500,
      linkId: "L",
      status: "generated"
    });
    store.getState().addClips([video, audio]);
    store.getState().rippleDeleteSelected(new Set([video.id]));
    const survivor = store.getState().clips.find((x) => x.id === audio.id);
    expect(survivor?.linkId).toBeUndefined();
  });
});

describe("closeGapAt", () => {
  it("pulls later clips left by the gap on the clicked track", () => {
    const { store, b, c, vo, clip } = storeWithCut();
    store.getState().deleteSelected(new Set([b.id]));
    store.getState().closeGapAt(clip(c.id).trackId, 1500);
    expect(clip(c.id).startMs).toBe(1000);
    expect(clip(vo.id).startMs).toBe(1200);
  });

  it("is a no-op inside a clip", () => {
    const { store, c, clip } = storeWithCut();
    store.getState().closeGapAt(clip(c.id).trackId, 500);
    expect(clip(c.id).startMs).toBe(2000);
  });
});
