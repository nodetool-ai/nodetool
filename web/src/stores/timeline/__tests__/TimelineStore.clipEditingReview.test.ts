import { describe, it, expect } from "@jest/globals";
import { createTimelineStore } from "../TimelineStore";
import { makeClip } from "@nodetool-ai/timeline";

/** One audio track holding a 2 s window looped to 8 s (4 repeats). */
function looped(over: Record<string, unknown> = {}) {
  const store = createTimelineStore();
  store.getState().addTrack("audio", "Audio 1");
  const trackId = store.getState().tracks[0]!.id;
  const clip = makeClip({
    trackId,
    mediaType: "audio",
    startMs: 0,
    durationMs: 8000,
    inPointMs: 0,
    outPointMs: 2000,
    loopLengthMs: 2000,
    status: "generated",
    ...over
  });
  store.getState().addClips([clip]);
  return { store, clip, trackId };
}

describe("F3 trimClipStart keeps a looped clip when the trim is refused", () => {
  it("a head trim that runs out of source leaves the loop alone", () => {
    const { store, clip } = looped();
    store.getState().trimClipStart(clip.id, 500);
    const clips = store.getState().clips;
    expect(clips).toHaveLength(1);
    expect(clips[0]!.loopLengthMs).toBe(2000);
  });

  it("a locked looped clip stays a loop", () => {
    const { store, clip } = looped({ locked: true });
    store.getState().trimClipStart(clip.id, -500);
    expect(store.getState().clips).toHaveLength(1);
    expect(store.getState().clips[0]!.loopLengthMs).toBe(2000);
  });

  it("a valid head trim unrolls the loop", () => {
    const { store, clip } = looped({
      startMs: 4000,
      inPointMs: 1000,
      outPointMs: 3000
    });
    store.getState().trimClipStart(clip.id, 500);
    expect(store.getState().clips.length).toBeGreaterThan(1);
    for (const c of store.getState().clips) {
      expect(c.loopLengthMs).toBeUndefined();
    }
  });
});

describe("F4 end trim of a looped clip is not bounded by the source", () => {
  it("trimClipEnd grows past the source duration", () => {
    const { store, clip } = looped({ durationMs: 4000 });
    store.getState().trimClipEnd(clip.id, 2000, 2000);
    expect(store.getState().clips[0]!.durationMs).toBe(6000);
  });
});

describe("F11 setClipSpeed scales the loop window", () => {
  it("halves the window with the duration", async () => {
    const { store, clip } = looped();
    store.getState().setClipSpeed(clip.id, 2);
    const c = store.getState().clips[0]!;
    expect(c.durationMs).toBe(4000);
    expect(c.loopLengthMs).toBe(1000);
  });
});

describe("F20 merge does not join looped clips", () => {
  it("leaves a looped right clip alone", () => {
    const { store, trackId } = looped({
      startMs: 2000,
      inPointMs: 2000,
      outPointMs: 4000,
      currentAssetId: "asset"
    });
    const left = makeClip({
      trackId,
      mediaType: "audio",
      startMs: 0,
      durationMs: 2000,
      inPointMs: 0,
      outPointMs: 2000,
      currentAssetId: "asset",
      status: "generated"
    });
    store.getState().addClips([left]);
    store.getState().mergeClipsAt(2000);
    expect(store.getState().clips).toHaveLength(2);
  });
});

describe("F22 loop grip on a time-remapped clip", () => {
  it("does nothing", () => {
    const { store, clip } = looped({
      durationMs: 2000,
      loopLengthMs: undefined,
      timeRemap: {
        keyframes: [
          { t: 0, sourceMs: 0 },
          { t: 1, sourceMs: 1000 }
        ]
      }
    });
    store.getState().loopClipToEnd(clip.id, 6000);
    expect(store.getState().clips[0]!.durationMs).toBe(2000);
  });
});

describe("ripple and roll start trims unroll a looped clip", () => {
  it("rippleTrimClipStart", () => {
    const { store, clip } = looped({ inPointMs: 1000, outPointMs: 3000 });
    store.getState().rippleTrimClipStart(clip.id, -500);
    for (const c of store.getState().clips) {
      expect(c.loopLengthMs).toBeUndefined();
    }
    expect(store.getState().clips.length).toBeGreaterThan(1);
  });
});
