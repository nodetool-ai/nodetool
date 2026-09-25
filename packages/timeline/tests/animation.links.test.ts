import { describe, expect, it } from "vitest";
import { timelineClip } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import { resolveAnimationLinks } from "../src/animation/links.js";
import type { TimelineClip } from "../src/types.js";

const source: TimelineClip = {
  id: "source", trackId: "track", name: "Source", startMs: 0,
  durationMs: 1000, mediaType: "shape", sourceType: "imported",
  status: "generated", locked: false, versions: [],
  transform: {
    position: { x: 10, y: 20 }, scale: { x: 1, y: 1 },
    rotation: 0, anchor: { x: 0.5, y: 0.5 }
  },
  animations: [{ id: "move", preset: "custom", role: "emphasis", durationMs: 1000,
    custom: { curves: [{ property: "offsetX", keyframes: [
      { t: 0, value: 0 }, { t: 1, value: 100 }
    ] }] } }]
};

describe("declarative animation links", () => {
  it("samples cross-property source motion with a time offset and a loop", () => {
    const target = { animationLinks: [{ target: "positionY" as const, sourceClipId: "source", source: "positionX" as const, timeOffsetMs: 500, loop: true }] };
    expect(resolveAnimationLinks(target, 250, [source], { width: 1000, height: 1000 }).positionY).toBeCloseTo(85);
    expect(resolveAnimationLinks(target, 1250, [source], { width: 1000, height: 1000 }).positionY).toBeCloseTo(85);
  });

  it("gives wiggle a stable value at the same frame", () => {
    const target = { animationLinks: [{ target: "rotation" as const, kind: "wiggle" as const, amplitude: 0.2, frequencyHz: 2, seed: 7 }] };
    const a = resolveAnimationLinks(target, 375, [], { width: 1000, height: 1000 });
    const b = resolveAnimationLinks(target, 375, [], { width: 1000, height: 1000 });
    expect(a).toEqual(b);
    expect(a.rotation).toBeGreaterThanOrEqual(-0.2);
    expect(a.rotation).toBeLessThanOrEqual(0.2);
  });

  it("ramps wiggle amplitude in clip-local time", () => {
    const target = { startMs: 1000, animationLinks: [{ target: "positionX" as const, kind: "wiggle" as const, amplitude: 6, frequencyHz: 1, seed: 7, amplitudeKeyframes: [
      { timeMs: 0, value: 0 }, { timeMs: 1000, value: 6 }
    ] }] };
    expect(timelineClip.parse({ ...source, ...target }).animationLinks).toEqual(target.animationLinks);
    expect(resolveAnimationLinks(target, 1000, [], { width: 100, height: 100 }).positionX).toBe(0);
    const halfway = resolveAnimationLinks(target, 1500, [], { width: 100, height: 100 }).positionX ?? 0;
    expect(Math.abs(halfway)).toBeLessThanOrEqual(3);
    expect(resolveAnimationLinks(target, 2000, [], { width: 100, height: 100 }).positionX).not.toBe(0);
  });

  it("does not recurse through linked sources or virtual repeater instances", () => {
    const cyclic: TimelineClip = { ...source, animationLinks: [
      { target: "positionX", sourceClipId: "source", source: "positionY" }
    ] };
    const target = { animationLinks: [{ target: "positionY" as const, sourceClipId: "source", source: "positionX" as const }] };
    expect(resolveAnimationLinks(target, 500, [cyclic, cyclic], { width: 1000, height: 1000 }).positionY).toBeCloseTo(60);
  });

  it("indexes and compiles a shared source once for a large follower set", () => {
    let idReads = 0;
    let animationReads = 0;
    const counted: TimelineClip = { ...source };
    Object.defineProperty(counted, "id", { get: () => { idReads++; return "source"; } });
    Object.defineProperty(counted, "animations", { get: () => { animationReads++; return source.animations; } });
    const clips: TimelineClip[] = [];
    for (let index = 0; index < 1200; index++) {
      const filler: TimelineClip = { ...source, id: `follower-${index}`, animations: undefined };
      Object.defineProperty(filler, "id", { get: () => { idReads++; return `follower-${index}`; } });
      clips.push(filler);
    }
    clips.push(counted);
    const follower = { animationLinks: [{ target: "positionY" as const, sourceClipId: "source", source: "positionX" as const }] };
    for (let index = 0; index < 1200; index++) {
      expect(resolveAnimationLinks(follower, 500, clips, { width: 1000, height: 1000 }).positionY).toBeCloseTo(60);
    }
    expect(idReads).toBeLessThan(2500);
    expect(animationReads).toBeLessThan(20);
  });

  it("follows source-time curves through the source media clock", () => {
    const mediaSource: TimelineClip = {
      ...source,
      animations: [{ id: "source-time", preset: "custom", role: "emphasis", durationMs: 1000,
        custom: { timeBase: "source", curves: [{ property: "offsetX", keyframes: [
          { t: 0, sourceMs: 0, value: 0 },
          { t: 1, sourceMs: 1000, value: 100 }
        ] }] } }]
    };
    const follower = { animationLinks: [{ target: "positionY" as const, sourceClipId: "source", source: "positionX" as const }] };
    expect(resolveAnimationLinks(follower, 500, [mediaSource], { width: 1000, height: 1000 }).positionY).toBeCloseTo(60);
  });

  it("follows a beat-anchored source and invalidates cached samples when tempo changes", () => {
    const beatSource: TimelineClip = {
      ...source,
      animations: [{ id: "beat", preset: "custom", role: "emphasis", durationMs: 500,
        beat: { scope: "clip", index: 2 },
        custom: { curves: [{ property: "offsetX", keyframes: [
          { t: 0, value: 0 }, { t: 1, value: 100 }
        ] }] } }]
    };
    const follower = { animationLinks: [{ target: "positionY" as const, sourceClipId: "source", source: "positionX" as const }] };
    const clips = [beatSource];
    const fast = { bpm: 120, offsetMs: 0, timeSignature: { beatsPerBar: 4, beatUnit: 4 } };
    const slow = { bpm: 60, offsetMs: 0, timeSignature: { beatsPerBar: 4, beatUnit: 4 } };
    expect(resolveAnimationLinks(follower, 750, clips, { width: 1000, height: 1000 }, fast).positionY).toBeCloseTo(60);
    expect(resolveAnimationLinks(follower, 750, clips, { width: 1000, height: 1000 }, slow).positionY).toBeCloseTo(10);
  });
});
