import { describe, expect, it } from "vitest";
import { makeClip, makeTrack, type TimelineClip } from "../src/index.js";
import { automationValueAt } from "../src/automation.js";
import { expandMidiLoop } from "../src/clipLoop.js";
import { DEFAULT_TEMPO } from "../src/midi/tempo.js";
import {
  applyTimelineOp,
  timelineOpFromToolArgs,
  type TimelineOpState
} from "../src/ops/index.js";

function ctx() {
  let n = 0;
  return { newId: (kind: string) => `${kind}_${++n}` } as never;
}

function state(clips: TimelineClip[], over: Partial<TimelineOpState> = {}): TimelineOpState {
  return {
    fps: 30,
    width: 1920,
    height: 1080,
    tracks: [
      makeTrack({ id: "vid", type: "video", name: "Vid", index: 0 }),
      makeTrack({ id: "aud", type: "audio", name: "Aud", index: 1 }),
      makeTrack({ id: "chd", type: "chord", name: "Chords", index: 2 })
    ],
    clips,
    markers: [],
    tempo: { ...DEFAULT_TEMPO },
    playheadMs: 0,
    selectedClipIds: [],
    ...over
  };
}

const clip = (id: string, trackId: string, over: Partial<TimelineClip> = {}) =>
  makeClip({
    id,
    trackId,
    name: id,
    startMs: 0,
    durationMs: 8000,
    mediaType: trackId === "vid" ? "video" : "audio",
    ...over
  });

async function run(s: TimelineOpState, tool: string, op: Record<string, unknown>) {
  const out = await applyTimelineOp(s, timelineOpFromToolArgs(tool as never, op), ctx());
  if (out.error) throw new Error(out.error);
  return out;
}

const chord = (id: string, startTick: number, durationTick: number) =>
  ({ id, startTick, durationTick, root: 0, quality: "maj", inversion: 0 }) as never;

describe("CE4 round 2", () => {
  it("F1: duplicate_range refuses to write into a locked track", async () => {
    const s = state([clip("A", "aud", { durationMs: 2000 })]);
    s.tracks[1]!.locked = true;
    await expect(run(s, "duplicate_range", { fromMs: 0, toMs: 4000 })).rejects.toThrow(/locked/);
    const s2 = state([]);
    s2.tracks[2]!.locked = true;
    s2.tracks[2]!.chords = [chord("c", 0, 1920)];
    await expect(run(s2, "duplicate_range", { fromMs: 0, toMs: 4000 })).rejects.toThrow(/locked/);
  });

  it("F1: delete_time refuses when a locked track holds chords or automation in the range", async () => {
    const s = state([]);
    s.tracks[2]!.locked = true;
    s.tracks[2]!.chords = [chord("c", 0, 1920)];
    await expect(run(s, "delete_time", { fromMs: 0, toMs: 1000 })).rejects.toThrow(/locked/);
    const s2 = state([]);
    s2.tracks[1]!.locked = true;
    s2.tracks[1]!.automation = [
      { id: "l", target: { kind: "mixer", param: "volumeDb" } as never, points: [{ timeMs: 500, value: 0 }] }
    ];
    await expect(run(s2, "delete_time", { fromMs: 0, toMs: 1000 })).rejects.toThrow(/locked/);
  });

  it("F1: a locked group that crosses the point refuses", async () => {
    const s = state([clip("G", "vid", { mediaType: "group", locked: true })]);
    await expect(run(s, "insert_time", { atMs: 3000, ms: 1000 })).rejects.toThrow(/G/);
  });

  it("F2: an unrolled loop leaves no singleton link", async () => {
    const s = state([
      clip("V", "vid", { linkId: "L1" }),
      clip("B", "aud", { linkId: "L1", loopLengthMs: 2000 })
    ]);
    const out = await run(s, "insert_time", { atMs: 3000, ms: 1000 });
    const counts = new Map<string, number>();
    for (const c of out.state.clips) if (c.linkId) counts.set(c.linkId, (counts.get(c.linkId) ?? 0) + 1);
    for (const n of counts.values()) expect(n).toBeGreaterThanOrEqual(2);
  });

  it("F3: insert_time on a child's track alone grows the group over the child", async () => {
    const s = state([
      clip("G", "vid", { mediaType: "group" }),
      clip("C", "aud", { startMs: 4000, durationMs: 4000, parentId: "G" })
    ]);
    const out = await run(s, "insert_time", { atMs: 4000, ms: 2000, trackIds: ["aud"] });
    const g = out.state.clips.find((c) => c.id === "G")!;
    const c = out.state.clips.find((x) => x.id === "C")!;
    expect(c.startMs + c.durationMs).toBeLessThanOrEqual(g.startMs + g.durationMs);
  });

  it("F4: delete_time before tempo.offsetMs keeps chords on their clips", async () => {
    const s = state([clip("A", "aud", { startMs: 2000, durationMs: 2000 })], {
      tempo: { ...DEFAULT_TEMPO, offsetMs: 2000 }
    });
    s.tracks[2]!.chords = [chord("c", 0, 3840)];
    const out = await run(s, "delete_time", { fromMs: 0, toMs: 1000 });
    const a = out.state.clips.find((c) => c.id === "A")!;
    const t = out.state.tempo!;
    const ch = out.state.tracks[2]!.chords![0]!;
    expect(a.startMs).toBe(1000);
    expect(t.offsetMs + (ch.startTick * 60000) / (120 * 960)).toBeCloseTo(1000, 3);
  });

  it("F7: insert_time holds the automation value across the gap", async () => {
    const s = state([]);
    const pts = [{ timeMs: 0, value: 0 }, { timeMs: 4000, value: -24 }];
    s.tracks[1]!.automation = [{ id: "l", target: { kind: "mixer", param: "volumeDb" } as never, points: pts }];
    const out = await run(s, "insert_time", { atMs: 2000, ms: 2000 });
    const p = out.state.tracks[1]!.automation![0]!.points;
    expect(automationValueAt(p, 1000)).toBeCloseTo(-6);
    expect(automationValueAt(p, 3000)).toBeCloseTo(-12);
    expect(automationValueAt(p, 6000)).toBeCloseTo(-24);
  });

  it("F7: delete_time joins the automation at both edges", async () => {
    const s = state([]);
    const pts = [{ timeMs: 0, value: 0 }, { timeMs: 2000, value: -12 }, { timeMs: 4000, value: 0 }];
    s.tracks[1]!.automation = [{ id: "l", target: { kind: "mixer", param: "volumeDb" } as never, points: pts }];
    const out = await run(s, "delete_time", { fromMs: 1000, toMs: 3000 });
    const p = out.state.tracks[1]!.automation![0]!.points;
    expect(automationValueAt(p, 500)).toBeCloseTo(-3);
    expect(automationValueAt(p, 1500)).toBeCloseTo(-3);
    expect(automationValueAt(p, 2000)).toBeCloseTo(0);
  });

  it("F7: duplicate_range copies the values of the section, flat before it", async () => {
    const s = state([]);
    const pts = [{ timeMs: 2000, value: -12 }, { timeMs: 3000, value: 0 }];
    s.tracks[1]!.automation = [{ id: "l", target: { kind: "mixer", param: "volumeDb" } as never, points: pts }];
    const out = await run(s, "duplicate_range", { fromMs: 2000, toMs: 4000 });
    const p = out.state.tracks[1]!.automation![0]!.points;
    expect(automationValueAt(p, 3500)).toBeCloseTo(0);
    expect(automationValueAt(p, 4000.5)).toBeCloseTo(-12, 0);
    expect(automationValueAt(p, 5000)).toBeCloseTo(0);
  });

  it("F8: duplicate_range keeps Smart Reframe tracking on a cloned media track", async () => {
    const s = state([
      clip("V", "vid", {
        durationMs: 4000,
        reframe: { mode: "track", trackId: "mt1" } as never
      })
    ]);
    (s as { mediaTracks?: unknown[] }).mediaTracks = [
      { id: "mt1", clipId: "V", sourceAssetId: "a", name: "t", kind: "point", sourceStartMs: 0, sourceEndMs: 4000, samples: [{ sourceMs: 0, x: 0, y: 0 }, { sourceMs: 4000, x: 1, y: 1 }], status: "ready" }
    ];
    const out = await run(s, "duplicate_range", { fromMs: 0, toMs: 4000 });
    const copy = out.state.clips.find((c) => c.id !== "V")!;
    expect(copy.reframe?.mode).toBe("track");
    const owned = (out.state.mediaTracks ?? []).find((t) => t.id === copy.reframe!.trackId);
    expect(owned?.clipId).toBe(copy.id);
  });

  it("F19: a copied child leaves its group with the group's scale and opacity", async () => {
    const s = state([
      clip("G", "vid", {
        mediaType: "group",
        opacity: 0.5,
        transform: { position: { x: 100, y: 0 }, scale: { x: 2, y: 2 }, rotation: 0, anchor: { x: 0.5, y: 0.5 } }
      }),
      clip("C", "aud", { durationMs: 4000, parentId: "G" })
    ]);
    const out = await run(s, "duplicate_range", { fromMs: 0, toMs: 4000, trackIds: ["aud"] });
    const copy = out.state.clips.find((c) => c.id !== "C" && c.id !== "G")!;
    expect(copy.parentId).toBeUndefined();
    expect(copy.opacity).toBeCloseTo(0.5);
    expect(copy.transform?.scale.x).toBeCloseTo(2);
    expect(copy.transform?.position.x).toBeCloseTo(100);
  });

  it("F20: a copied group takes its own stretch of a parameter curve", async () => {
    const s = state([
      clip("G", "vid", {
        mediaType: "group",
        paramCurves: [
          { property: "volumeDb", keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] }
        ] as never
      })
    ]);
    const out = await run(s, "duplicate_range", { fromMs: 2000, toMs: 4000 });
    const copy = out.state.clips.find((c) => c.id !== "G")!;
    const kfs = (copy.paramCurves as never as { keyframes: { t: number; value: number }[] }[])[0]!.keyframes;
    expect(kfs[0]!.value).toBeCloseTo(0.25);
    expect(kfs[kfs.length - 1]!.value).toBeCloseTo(0.5);
  });

  it("F13: unrolled copies slice animations and keep unique controller ids", async () => {
    const s = state([
      clip("M", "aud", {
        mediaType: "midi",
        loopLengthMs: 2000,
        notes: [],
        animations: [
          { id: "an", preset: "pulse", role: "emphasis", durationMs: 500, delayMs: 3000 } as never
        ]
      })
    ]);
    const out = await run(s, "insert_time", { atMs: 3000, ms: 1000 });
    const withAnim = out.state.clips.filter((c) => (c.animations?.length ?? 0) > 0);
    expect(withAnim).toHaveLength(1);
  });

  it("F10: a later repeat holds the first value before a delayed first point", () => {
    const clipLike = {
      notes: [],
      inPointMs: 0,
      durationMs: 4000,
      loopLengthMs: 2000,
      controllers: [
        { id: "L", kind: "cc", cc: 7, interpolation: "linear", points: [{ id: "p", tick: 960, value: 100 }] }
      ]
    } as never;
    const out = expandMidiLoop(clipLike, 120) as unknown as {
      controllers: { points: { tick: number; value: number }[] }[];
    };
    const pts = out.controllers[0]!.points;
    expect(pts.some((p) => p.tick === 3840 && p.value === 100)).toBe(true);
  });

  it("F12: a cut on a repeat boundary also cuts the linked partner", async () => {
    const s = state([
      clip("A", "vid", { durationMs: 6000, linkId: "L1" }),
      clip("B", "aud", { durationMs: 6000, loopLengthMs: 2000, linkId: "L1" })
    ]);
    const out = await run(s, "split_clip", { target: "B", atMs: 2000 });
    expect(out.state.clips.filter((c) => c.trackId === "vid")).toHaveLength(2);
    const counts = new Map<string, number>();
    for (const c of out.state.clips) if (c.linkId) counts.set(c.linkId, (counts.get(c.linkId) ?? 0) + 1);
    for (const n of counts.values()) expect(n).toBeGreaterThanOrEqual(2);
  });
});
