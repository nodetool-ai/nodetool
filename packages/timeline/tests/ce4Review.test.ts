import { describe, expect, it } from "vitest";
import { makeClip, makeTrack, type TimelineClip } from "../src/index.js";
import { DEFAULT_TEMPO } from "../src/midi/tempo.js";
import { splitClip } from "../src/splitClip.js";
import { expandMidiLoop, unrollLoopedClip } from "../src/clipLoop.js";
import { resolveInsert } from "../src/dropResolve.js";
import {
  applyTimelineOp,
  timelineOpFromToolArgs,
  type TimelineOpState
} from "../src/ops/index.js";

describe("F9 splitClip on a midi clip without an out point", () => {
  it("leaves the right half without a stale out point", () => {
    const clip = makeClip({
      id: "m",
      trackId: "k",
      name: "m",
      startMs: 0,
      durationMs: 4000,
      mediaType: "midi",
      notes: []
    });
    expect(clip.outPointMs).toBeUndefined();
    const [, right] = splitClip(clip, 2000, { bpm: 120 });
    expect(right.outPointMs).toBeUndefined();
  });
});

describe("F11 loop_clip checks the source when outPointMs is unset", () => {
  it("refuses a window longer than the known source", async () => {
    const aud = makeClip({
      id: "a",
      trackId: "aud",
      name: "a",
      startMs: 0,
      durationMs: 2000,
      mediaType: "audio",
      sourceType: "imported",
      currentAssetId: "asset1"
    });
    expect(aud.outPointMs).toBeUndefined();
    const s: TimelineOpState = {
      fps: 30,
      width: 1920,
      height: 1080,
      tracks: [makeTrack({ id: "aud", type: "audio", name: "Aud", index: 0 })],
      clips: [aud],
      markers: [],
      tempo: { ...DEFAULT_TEMPO },
      playheadMs: 0,
      selectedClipIds: []
    };
    let n = 0;
    const ctx = {
      newId: (k: string) => `${k}_${++n}`,
      resolveAsset: async () => ({ durationMs: 2000 })
    } as never;
    const out = await applyTimelineOp(
      s,
      timelineOpFromToolArgs("loop_clip" as never, { clip: "a", loopLengthMs: 5000, times: 2 }),
      ctx
    );
    expect(out.error).toMatch(/source of 2000/);
  });
});

describe("F12 resolveInsert", () => {
  const c = (id: string, extra: Partial<TimelineClip>): TimelineClip =>
    ({
      id,
      trackId: "a1",
      name: id,
      startMs: 0,
      durationMs: 6000,
      mediaType: "audio",
      sourceType: "imported",
      status: "generated",
      locked: false,
      versions: [],
      ...extra
    }) as TimelineClip;

  it("does not unroll a looped straddler whose linked partner is locked", () => {
    const looped = c("B", { loopLengthMs: 2000, linkId: "L1", inPointMs: 0, outPointMs: 2000 });
    const partner = c("A", { trackId: "v1", linkId: "L1" });
    const mover = c("m", { trackId: "a1", startMs: 1000, durationMs: 500 });
    const out = resolveInsert([looped, partner, mover], new Set(["m"]), {
      lockedClipIds: new Set(["A"])
    });
    expect(out.find((x) => x.id === "B")).toBeDefined();
    expect(out.find((x) => x.id === "B")!.loopLengthMs).toBe(2000);
    expect(out.find((x) => x.id === "B")!.startMs).toBe(0);
  });
});

describe("F10 and F13 loop expansion", () => {
  it("F10: a linear bend ramp reaching the window end is not flattened to zero", () => {
    const clip = {
      id: "m",
      trackId: "k",
      startMs: 0,
      durationMs: 4000,
      loopLengthMs: 2000,
      mediaType: "midi",
      notes: [],
      controllers: [
        {
          id: "pb",
          kind: "pitchBend",
          points: [
            { id: "p1", tick: 0, value: 0 },
            { id: "p2", tick: 3840, value: 4096 }
          ]
        }
      ]
    } as unknown as TimelineClip;
    const out = expandMidiLoop(clip, 120);
    const pts = out.controllers![0]!.points.filter((p) => p.tick < 3840);
    expect(Math.max(...pts.map((p) => p.value))).toBeGreaterThan(4000);
  });

  it("F13: unroll mints unique controller point ids", () => {
    const clip = {
      id: "m",
      trackId: "k",
      startMs: 0,
      durationMs: 4000,
      loopLengthMs: 2000,
      inPointMs: 250,
      mediaType: "midi",
      notes: [],
      controllers: [
        {
          id: "L1",
          kind: "cc",
          cc: 1,
          points: [
            { id: "L1~c", tick: 960, value: 10 },
            { id: "x", tick: 400, value: 20 }
          ]
        }
      ]
    } as unknown as TimelineClip;
    const copies = unrollLoopedClip(clip, 120, 2000, { newId: () => "n" + Math.random() });
    for (const copy of copies) {
      const ids = copy.controllers![0]!.points.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("F13: a clip-length volume curve is sliced across the unrolled copies", () => {
    const clip = {
      id: "a",
      trackId: "aud",
      startMs: 0,
      durationMs: 4000,
      loopLengthMs: 2000,
      mediaType: "audio",
      paramCurves: [
        {
          property: "volume",
          keyframes: [
            { t: 0, value: 0 },
            { t: 1, value: 1 }
          ]
        }
      ]
    } as unknown as TimelineClip;
    const copies = unrollLoopedClip(clip, 120, 2000, { newId: () => "c2" });
    const first = copies[0]!.paramCurves![0]!.keyframes;
    const second = copies[1]!.paramCurves![0]!.keyframes;
    expect(first[first.length - 1]!.value).toBeCloseTo(0.5, 2);
    expect(second[0]!.value).toBeCloseTo(0.5, 2);
  });
});

describe("F12 headless split_clip on a linked looped clip", () => {
  it("leaves no clip holding a link that nothing else shares", async () => {
    const mk = (id: string, trackId: string, extra: Partial<TimelineClip>) =>
      makeClip({
        id,
        trackId,
        name: id,
        startMs: 0,
        durationMs: 6000,
        mediaType: "audio",
        linkId: "L1",
        ...extra
      });
    const s: TimelineOpState = {
      fps: 30,
      width: 1920,
      height: 1080,
      tracks: [
        makeTrack({ id: "a1", type: "audio", name: "A1", index: 0 }),
        makeTrack({ id: "a2", type: "audio", name: "A2", index: 1 })
      ],
      clips: [mk("A", "a1", {}), mk("B", "a2", { loopLengthMs: 2000 })],
      markers: [],
      tempo: { ...DEFAULT_TEMPO },
      playheadMs: 0,
      selectedClipIds: []
    };
    let n = 0;
    const out = await applyTimelineOp(
      s,
      timelineOpFromToolArgs("split_clip" as never, { target: "A", atMs: 3000 }),
      { newId: (k: string) => `${k}_${++n}` } as never
    );
    expect(out.error).toBeUndefined();
    const counts = new Map<string, number>();
    for (const c of out.state.clips) if (c.linkId) counts.set(c.linkId, (counts.get(c.linkId) ?? 0) + 1);
    for (const count of counts.values()) expect(count).toBeGreaterThanOrEqual(2);
  });
});
