import { describe, it, expect } from "@jest/globals";
import { makeClip } from "@nodetool-ai/timeline";
import { createTimelineStore, targetedTrackIds } from "../TimelineStore";
import { createTimelineUIStore } from "../TimelineUIStore";

/** V1: a | b back to back; A1: vo under b, music after it. */
function storeWithCut() {
  const store = createTimelineStore();
  store.getState().addTrack("video", "Video 1");
  store.getState().addTrack("audio", "Audio 1");
  const [v1, a1] = store.getState().tracks.map((t) => t.id);
  const mk = (trackId: string, startMs: number, durationMs: number) =>
    makeClip({
      trackId,
      mediaType: trackId === a1 ? "audio" : "video",
      startMs,
      durationMs,
      inPointMs: 0,
      outPointMs: durationMs,
      status: "generated"
    });
  const a = mk(v1, 0, 1000);
  const b = mk(v1, 1000, 1000);
  const vo = mk(a1, 1200, 400);
  const music = mk(a1, 1600, 400);
  store.getState().addClips([a, b, vo, music]);
  const clip = (id: string) => store.getState().clips.find((x) => x.id === id)!;
  return { store, v1, a1, a, b, vo, music, clip };
}

describe("track targeting", () => {
  it("targets every unlocked track by default", () => {
    const { store, v1, a1 } = storeWithCut();
    expect([...targetedTrackIds(store.getState())].sort()).toEqual(
      [v1, a1].sort()
    );
  });

  it("lifts a range only on targeted tracks", () => {
    const { store, a1, vo, clip } = storeWithCut();
    store.getState().setTrackTargeted(a1, false);
    store.getState().removeRange(1100, 1300, false);
    expect(clip(vo.id).durationMs).toBe(400);
    expect(store.getState().clips.filter((c) => c.trackId === a1)).toHaveLength(2);
  });

  it("adds an edit only on the tracks it is given", () => {
    const { store, v1 } = storeWithCut();
    store.getState().splitSelectedAtPlayhead(1300, new Set(), new Set([v1]));
    const onV1 = store.getState().clips.filter((c) => c.trackId === v1);
    expect(onV1).toHaveLength(3);
    // The audio clip under the playhead is not cut.
    expect(store.getState().clips).toHaveLength(5);
  });
});

describe("sync lock", () => {
  it("keeps a track with sync lock off still during a ripple", () => {
    const { store, a, a1, vo, b, clip } = storeWithCut();
    store.getState().setTrackSyncLocked(a1, false);
    store.getState().rippleTrimClipEnd(a.id, -300);
    expect(clip(b.id).startMs).toBe(700);
    expect(clip(vo.id).startMs).toBe(1200);
  });

  it("still ripples the edited track when its own sync lock is off", () => {
    const { store, a, v1, b, clip } = storeWithCut();
    store.getState().setTrackSyncLocked(v1, false);
    store.getState().rippleTrimClipEnd(a.id, -300);
    expect(clip(b.id).startMs).toBe(700);
  });
});

describe("setClipSpeed with ripple", () => {
  it("pushes later clips by the change in length instead of capping", () => {
    const { store, a, b, vo, clip } = storeWithCut();
    store.getState().setClipSpeed(a.id, 0.5, { ripple: true });
    expect(clip(a.id).durationMs).toBe(2000);
    expect(clip(b.id).startMs).toBe(2000);
    expect(clip(vo.id).startMs).toBe(2200);
  });

  it("caps at the next clip without ripple", () => {
    const { store, a, b, clip } = storeWithCut();
    store.getState().setClipSpeed(a.id, 0.5);
    expect(clip(a.id).durationMs).toBe(1000);
    expect(clip(b.id).startMs).toBe(1000);
  });
});

describe("setClipsGain", () => {
  it("sets or adjusts the volume of audible clips", () => {
    const { store, vo, music, clip } = storeWithCut();
    store.getState().patchClip(music.id, { volumeDb: -6 });
    store.getState().setClipsGain(new Set([vo.id, music.id]), 3, "adjust");
    expect(clip(vo.id).volumeDb).toBe(3);
    expect(clip(music.id).volumeDb).toBe(-3);
    store.getState().setClipsGain(new Set([vo.id, music.id]), -10, "set");
    expect(clip(vo.id).volumeDb).toBe(-10);
    expect(clip(music.id).volumeDb).toBe(-10);
  });

  it("clamps to the fader range", () => {
    const { store, vo, clip } = storeWithCut();
    store.getState().setClipsGain(new Set([vo.id]), 80, "set");
    expect(clip(vo.id).volumeDb).toBe(24);
  });
});

describe("pasteClipAttributes", () => {
  it("copies picture groups to picture clips and sound groups to audible ones", () => {
    const { store, a, b, vo, clip } = storeWithCut();
    store.getState().patchClip(a.id, { opacity: 0.4, volumeDb: -8 });
    const source = clip(a.id);
    store
      .getState()
      .pasteClipAttributes(
        new Set([b.id, vo.id]),
        source,
        new Set(["opacity", "volume"])
      );
    expect(clip(b.id).opacity).toBe(0.4);
    expect(clip(b.id).volumeDb).toBe(-8);
    expect(clip(vo.id).opacity).toBeUndefined();
    expect(clip(vo.id).volumeDb).toBe(-8);
  });
});

describe("applyDefaultAudioTransition", () => {
  it("cross-fades audio clips at a cut and leaves video alone", () => {
    const { store, a, vo, music, clip } = storeWithCut();
    store
      .getState()
      .applyDefaultAudioTransition(new Set([a.id, music.id]), 200);
    expect(clip(a.id).fadeInMs).toBeUndefined();
    expect(clip(vo.id).fadeOutMs).toBe(200);
    expect(clip(vo.id).durationMs).toBe(600);
    expect(clip(music.id).fadeInMs).toBe(200);
    expect(clip(music.id).fadeOutShape).toBe("plus3dB");
  });
});

describe("gap selection", () => {
  it("clears the clip selection and is cleared by one", () => {
    const ui = createTimelineUIStore();
    ui.getState().setSelection(["x"]);
    ui.getState().setSelectedGap({ trackId: "t", startMs: 0, endMs: 100 });
    expect(ui.getState().selectedClipIds.size).toBe(0);
    ui.getState().selectClip("y");
    expect(ui.getState().selectedGap).toBeNull();
  });
});
