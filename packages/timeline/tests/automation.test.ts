import { describe, expect, it } from "vitest";
import {
  automationLane as protocolAutomationLane,
  timelineTrack as protocolTimelineTrack,
  type AutomationLane as ProtocolAutomationLane
} from "@nodetool-ai/protocol/api-schemas/timeline.js";

import {
  addAutomationPoint,
  applyTrackAutomation,
  automationBreakpoints,
  automationTargetKey,
  automationValueAt,
  findAutomationLane,
  makeClip,
  makeTrack,
  moveAutomationPoint,
  removeAutomationPoints,
  setAutomationPointEasing,
  trackAcceptsAutomationTarget,
  INSTRUMENT_DEVICE_ID
} from "../src/index.js";
import type { AutomationLane, AutomationPoint, TimelineClip, TimelineTrack } from "../src/index.js";
import { computeActiveLayers, resolveAnimatedLayerProps } from "../src/render/sceneModel.js";

const CANVAS = { width: 1920, height: 1080 };

const points = (...pairs: [number, number, string?][]): AutomationPoint[] =>
  pairs.map(([timeMs, value, easing]) =>
    easing === undefined ? { timeMs, value } : { timeMs, value, easing }
  );

const lane = (target: AutomationLane["target"], pts: AutomationPoint[]): AutomationLane => ({
  id: `lane-${automationTargetKey(target)}`,
  target,
  points: pts
});

const videoClip = (overrides: Partial<TimelineClip>): TimelineClip =>
  makeClip({
    status: "generated",
    currentAssetId: "asset-1",
    mediaType: "video",
    trackId: "v",
    ...overrides
  });

describe("automationValueAt", () => {
  const ramp = points([1000, 0], [2000, 1]);

  it("holds before the first point and after the last", () => {
    expect(automationValueAt(ramp, 0)).toBe(0);
    expect(automationValueAt(ramp, 5000)).toBe(1);
  });

  it("interpolates linearly between points", () => {
    expect(automationValueAt(ramp, 1500)).toBeCloseTo(0.5);
  });

  it("eases a segment by the easing on its later point, as a clip keyframe does", () => {
    const eased = points([0, 0], [1000, 1, "easeIn"]);
    expect(automationValueAt(eased, 500)).toBeLessThan(0.5);
    const held = points([0, 0], [1000, 1, "hold"]);
    expect(automationValueAt(held, 999)).toBe(0);
    expect(automationValueAt(held, 1000)).toBe(1);
  });

  it("returns the fallback without points", () => {
    expect(automationValueAt([], 10, 0.7)).toBe(0.7);
  });
});

describe("automationBreakpoints", () => {
  it("starts at the value at fromMs and keeps a linear lane as its points", () => {
    expect(automationBreakpoints(points([0, 0], [1000, 10], [2000, 0]), 500)).toEqual([
      { timeMs: 500, value: 5 },
      { timeMs: 1000, value: 10 },
      { timeMs: 2000, value: 0 }
    ]);
  });

  it("cuts an eased segment into pieces that follow its curve, from inside the segment", () => {
    const eased = points([0, 0], [1000, 1, "easeInOut"]);
    const bps = automationBreakpoints(eased, 250, { maxStepMs: 50 });
    expect(bps[0]).toEqual({ timeMs: 250, value: automationValueAt(eased, 250) });
    expect(bps.length).toBe(16);
    for (const bp of bps) {
      expect(bp.value).toBeCloseTo(automationValueAt(eased, bp.timeMs), 9);
    }
    expect(bps[bps.length - 1]).toEqual({ timeMs: 1000, value: 1 });
  });

  it("writes a hold as a jump at the later point's time", () => {
    expect(automationBreakpoints(points([0, 2], [1000, 8, "hold"]), 0)).toEqual([
      { timeMs: 0, value: 2 },
      { timeMs: 1000, value: 2 },
      { timeMs: 1000, value: 8 }
    ]);
  });

  it("subdivides linear segments only when asked", () => {
    const linear = points([0, -60], [1000, 0]);
    expect(automationBreakpoints(linear, 0, { maxStepMs: 100 })).toHaveLength(2);
    expect(automationBreakpoints(linear, 0, { maxStepMs: 100, subdivideLinear: true })).toHaveLength(11);
  });

  it("is empty for an empty lane", () => {
    expect(automationBreakpoints([], 0)).toEqual([]);
  });
});

describe("point edits", () => {
  it("adds in time order and replaces a point at the same time, keeping its easing", () => {
    const start = points([0, 0], [1000, 1, "easeOut"]);
    const added = addAutomationPoint(start, { timeMs: 500, value: 0.3 });
    expect(added.index).toBe(1);
    expect(added.points.map((p) => p.timeMs)).toEqual([0, 500, 1000]);
    const replaced = addAutomationPoint(added.points, { timeMs: 1000, value: 0.9 });
    expect(replaced.points).toHaveLength(3);
    expect(replaced.points[2]).toEqual({ timeMs: 1000, value: 0.9, easing: "easeOut" });
  });

  it("keeps a moved point between its neighbours", () => {
    const start = points([0, 0], [500, 1], [1000, 0]);
    expect(moveAutomationPoint(start, 1, 2000, 2)[1]).toEqual({ timeMs: 1000, value: 2 });
    expect(moveAutomationPoint(start, 1, -50, 2)[1]).toEqual({ timeMs: 0, value: 2 });
  });

  it("removes points and sets a segment's easing (linear stores nothing)", () => {
    const start = points([0, 0], [500, 1], [1000, 0]);
    expect(removeAutomationPoints(start, [0, 2])).toEqual([{ timeMs: 500, value: 1 }]);
    expect(setAutomationPointEasing(start, 1, "hold")[1]).toEqual({ timeMs: 500, value: 1, easing: "hold" });
    expect(setAutomationPointEasing(points([0, 0, "hold"]), 0, "linear")[0]).toEqual({ timeMs: 0, value: 0 });
  });
});

describe("targets", () => {
  it("finds a track's lane by target", () => {
    const filter = { kind: "device" as const, deviceId: INSTRUMENT_DEVICE_ID, param: "filter.cutoff" };
    const track = makeTrack({ type: "midi", automation: [lane(filter, points([0, 400]))] });
    expect(findAutomationLane(track, { ...filter })?.points).toEqual([{ timeMs: 0, value: 400 }]);
    expect(findAutomationLane(track, { kind: "mixer", param: "pan" })).toBeUndefined();
  });

  it("accepts mixer lanes on sound tracks, clip lanes on picture tracks and effect lanes for present effects", () => {
    const audio = makeTrack({
      type: "audio",
      effects: [{ id: "fx1", type: "gain", enabled: true, gainDb: 0 }]
    });
    const video = makeTrack({ type: "video" });
    expect(trackAcceptsAutomationTarget(audio, { kind: "mixer", param: "volumeDb" })).toBe(true);
    expect(trackAcceptsAutomationTarget(video, { kind: "mixer", param: "volumeDb" })).toBe(false);
    expect(trackAcceptsAutomationTarget(video, { kind: "clip", property: "opacity" })).toBe(true);
    expect(trackAcceptsAutomationTarget(audio, { kind: "device", deviceId: "fx1", param: "gainDb" })).toBe(true);
    expect(trackAcceptsAutomationTarget(audio, { kind: "device", deviceId: "gone", param: "gainDb" })).toBe(false);
    expect(
      trackAcceptsAutomationTarget(audio, { kind: "device", deviceId: INSTRUMENT_DEVICE_ID, param: "x" })
    ).toBe(false);
  });
});

describe("applyTrackAutomation", () => {
  const opacityLane = lane({ kind: "clip", property: "opacity" }, points([0, 0], [2000, 1]));
  const tracks: TimelineTrack[] = [
    makeTrack({ id: "v", type: "video", index: 0, automation: [opacityLane] }),
    makeTrack({ id: "w", type: "video", index: 1 })
  ];
  const clips = [
    videoClip({ id: "a", startMs: 1000, durationMs: 1000 }),
    videoClip({ id: "b", trackId: "w", startMs: 0, durationMs: 1000 })
  ];

  it("folds a picture lane onto every clip of its track in document time", () => {
    const automated = applyTrackAutomation(tracks, clips);
    const a = automated.find((c) => c.id === "a")!;
    // Document 1500 ms is the clip's middle; the lane reads 0.75 there.
    expect(resolveAnimatedLayerProps({ clip: a, opacity: 1 }, 1500, CANVAS).opacity).toBeCloseTo(0.75);
    expect(resolveAnimatedLayerProps({ clip: a, opacity: 1 }, 1000, CANVAS).opacity).toBeCloseTo(0.5);
    // Clips on other tracks are the same objects.
    expect(automated.find((c) => c.id === "b")).toBe(clips[1]);
  });

  it("reaches the layers every renderer composes", () => {
    const [layer] = computeActiveLayers(tracks, clips, 1500).filter((l) => l.clipId === "a");
    expect(resolveAnimatedLayerProps(layer, 1500, CANVAS).opacity).toBeCloseTo(0.75);
  });

  it("adds onto a clip's own keyframes instead of replacing them", () => {
    const offsetTracks = [
      makeTrack({
        id: "v",
        type: "video",
        automation: [lane({ kind: "clip", property: "offsetX" }, points([0, 100]))]
      })
    ];
    const moved = videoClip({
      id: "m",
      startMs: 0,
      durationMs: 1000,
      transform: { position: { x: 10, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 } }
    });
    const [automated] = applyTrackAutomation(offsetTracks, [moved]);
    expect(resolveAnimatedLayerProps({ clip: automated, transform: moved.transform, opacity: 1 }, 500, CANVAS).transform?.position.x).toBeCloseTo(110);
  });

  it("returns the same array without picture lanes and caches by identity", () => {
    const plain = [makeTrack({ id: "v", type: "video" })];
    expect(applyTrackAutomation(plain, clips)).toBe(clips);
    expect(applyTrackAutomation(tracks, clips)).toBe(applyTrackAutomation(tracks, clips));
  });

  it("skips disabled lanes", () => {
    const off = [makeTrack({ id: "v", type: "video", automation: [{ ...opacityLane, enabled: false }] })];
    expect(applyTrackAutomation(off, clips)).toBe(clips);
  });
});

// Both directions: a field on one side and not the other breaks compilation.
const laneThere: ProtocolAutomationLane = {
  id: "l",
  target: { kind: "device", deviceId: INSTRUMENT_DEVICE_ID, param: "filter.cutoff" },
  points: [{ timeMs: 0, value: 400, easing: "easeIn" }],
  enabled: false
} satisfies AutomationLane;
const laneBack: AutomationLane = laneThere;

describe("protocol schema", () => {
  it("keeps a track's lanes through a PATCH parse", () => {
    const track = makeTrack({ type: "midi", automation: [laneBack] });
    expect(protocolTimelineTrack.parse(track).automation).toEqual([laneThere]);
  });

  it("rejects a point with a negative or non-finite time", () => {
    expect(protocolAutomationLane.safeParse({ ...laneThere, points: [{ timeMs: -1, value: 0 }] }).success).toBe(false);
    expect(protocolAutomationLane.safeParse({ ...laneThere, points: [{ timeMs: Infinity, value: 0 }] }).success).toBe(false);
  });
});
