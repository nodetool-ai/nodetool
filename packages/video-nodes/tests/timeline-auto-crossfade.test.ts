import { describe, expect, it } from "vitest";
import { makeClip, makeTrack, type TimelineSequence } from "@nodetool-ai/timeline";
import { audioClipFilter, clipFadeSteps, mixableAudioClips } from "../src/nodes/timeline.js";

function sequence(music: TimelineSequence["music"]): TimelineSequence {
  const audio = (id: string, startMs: number) =>
    makeClip({
      id,
      trackId: "aud",
      name: id,
      startMs,
      durationMs: 1000,
      mediaType: "audio",
      sourceType: "imported",
      currentAssetId: "asset_1",
      status: "generated"
    });
  return {
    fps: 30,
    width: 64,
    height: 64,
    tracks: [makeTrack({ id: "aud", type: "audio", name: "Aud", index: 0 })],
    clips: [audio("a", 0), audio("b", 1000)],
    markers: [],
    music
  } as unknown as TimelineSequence;
}

describe("automatic crossfade at export (CE7, D54)", () => {
  it("fades the touching cut of a music project with the 10 ms default", () => {
    const clips = mixableAudioClips(sequence({}));
    expect(clips.find((c) => c.id === "a")!.fadeOutMs).toBe(5);
    expect(clips.find((c) => c.id === "b")!.fadeInMs).toBe(5);
  });

  it("honours the project setting and leaves other projects alone", () => {
    const set = mixableAudioClips(sequence({ autoCrossfadeMs: 20 }));
    expect(set.find((c) => c.id === "b")!.fadeInMs).toBe(10);
    const plain = mixableAudioClips(sequence(undefined));
    expect(plain.find((c) => c.id === "b")!.fadeInMs).toBeUndefined();
  });
});

describe("sub-millisecond fades (F13)", () => {
  it("emits no afade whose duration prints as 0.000", () => {
    const [a] = mixableAudioClips(sequence({ autoCrossfadeMs: 0.8 }));
    expect(a!.fadeOutMs).toBeCloseTo(0.4);
    const steps = clipFadeSteps(a!, 0);
    expect(steps.join(" ")).not.toContain("d=0.000");
    expect(steps).toEqual([]);
  });
});

describe("clip placement (F13 round 2)", () => {
  it("delays a clip by its exact start, not a rounded millisecond", () => {
    const clip = makeClip({
      id: "x",
      trackId: "aud",
      name: "x",
      startMs: 1000.4,
      durationMs: 1000,
      mediaType: "audio"
    });
    expect(audioClipFilter(clip, 0, "l")).toContain("adelay=1000.4|1000.4");
  });
});

describe("out point shorter than the clip (F18 round 2)", () => {
  it("starts the fade-out where the trimmed audio ends", () => {
    const clip = makeClip({
      id: "x",
      trackId: "aud",
      name: "x",
      startMs: 0,
      durationMs: 1000,
      inPointMs: 0,
      outPointMs: 995,
      fadeOutMs: 5,
      mediaType: "audio"
    });
    expect(audioClipFilter(clip, 0, "l")).toContain("afade=t=out:st=0.990:d=0.005");
  });
});
