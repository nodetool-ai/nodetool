import { describe, expect, it } from "vitest";
import { makeClip, makeTrack, type TimelineClip } from "../src/index.js";
import { automationValueAt } from "../src/automation.js";
import { DEFAULT_TEMPO } from "../src/midi/tempo.js";
import {
  applyTimelineOp,
  readSectionContent,
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

const lane = (points: Array<{ timeMs: number; value: number; easing?: string }>) => ({
  id: "l",
  target: { kind: "mixer", param: "volumeDb" } as never,
  points
});

describe("CE4 round 3", () => {
  it("F1: delete_time refuses when a locked lane ramps across the range", async () => {
    const s = state([]);
    s.tracks[1]!.locked = true;
    s.tracks[1]!.automation = [lane([{ timeMs: 0, value: 0 }, { timeMs: 4000, value: -24 }])];
    await expect(run(s, "delete_time", { fromMs: 1000, toMs: 3000 })).rejects.toThrow(/locked/);
  });

  it("F4: a trackIds-scoped delete before tempo.offsetMs refuses to clamp chords", async () => {
    const s = state([], { tempo: { ...DEFAULT_TEMPO, offsetMs: 2000 } });
    s.tracks[2]!.chords = [chord("c", 0, 3840)];
    await expect(
      run(s, "delete_time", { fromMs: 0, toMs: 1000, trackIds: ["chd"] })
    ).rejects.toThrow(/beat one|offset/);
  });

  it("F7: insert_time keeps the easing of the ramp before the point", async () => {
    for (const easing of ["easeIn", "easeOut", "cubic-bezier(0.4,0,0.2,1)"]) {
      const pts = [{ timeMs: 0, value: 0 }, { timeMs: 4000, value: -24, easing }];
      const s = state([]);
      s.tracks[1]!.automation = [lane(pts)];
      const out = await run(s, "insert_time", { atMs: 2000, ms: 2000 });
      const p = out.state.tracks[1]!.automation![0]!.points;
      for (const t of [500, 1000, 1500, 2000]) {
        expect(automationValueAt(p, t)).toBeCloseTo(automationValueAt(pts, t), 1);
      }
      expect(automationValueAt(p, 3000)).toBeCloseTo(automationValueAt(pts, 2000), 5);
      for (const t of [2500, 3000, 3500]) {
        expect(automationValueAt(p, t + 2000)).toBeCloseTo(automationValueAt(pts, t), 1);
      }
    }
  });

  it("F7: delete_time keeps the easing on both sides of the cut", async () => {
    const pts = [{ timeMs: 0, value: 0 }, { timeMs: 4000, value: -24, easing: "easeIn" }];
    const s = state([]);
    s.tracks[1]!.automation = [lane(pts)];
    const out = await run(s, "delete_time", { fromMs: 1000, toMs: 2000 });
    const p = out.state.tracks[1]!.automation![0]!.points;
    expect(automationValueAt(p, 500)).toBeCloseTo(automationValueAt(pts, 500), 3);
    expect(automationValueAt(p, 1500)).toBeCloseTo(automationValueAt(pts, 2500), 1);
    expect(automationValueAt(p, 3000)).toBeCloseTo(automationValueAt(pts, 4000), 3);
  });

  it("F19: a child that is rotated refuses an uneven group scale", async () => {
    const s = state([
      clip("G", "vid", {
        mediaType: "group",
        transform: { position: { x: 0, y: 0 }, scale: { x: 2, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 } }
      }),
      clip("C", "aud", {
        durationMs: 4000,
        parentId: "G",
        transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 30, anchor: { x: 0.5, y: 0.5 } }
      })
    ]);
    await expect(
      run(s, "duplicate_range", { fromMs: 0, toMs: 4000, trackIds: ["aud"] })
    ).rejects.toThrow(/scale/);
  });

  it("F26: deleting a group's window on its own track bakes its look into the children", async () => {
    const s = state([
      clip("G", "vid", {
        mediaType: "group",
        durationMs: 4000,
        opacity: 0.5,
        transform: { position: { x: 100, y: 0 }, scale: { x: 2, y: 2 }, rotation: 0, anchor: { x: 0.5, y: 0.5 } }
      }),
      clip("C", "aud", { durationMs: 4000, parentId: "G" })
    ]);
    const out = await run(s, "delete_time", { fromMs: 0, toMs: 4000, trackIds: ["vid"] });
    const c = out.state.clips.find((x) => x.id === "C")!;
    expect(c.parentId).toBeUndefined();
    expect(c.opacity).toBeCloseTo(0.5);
    expect(c.transform?.scale.x).toBeCloseTo(2);
    expect(c.transform?.position.x).toBeCloseTo(100);
  });

  it("F26: a group that cannot be baked refuses the delete", async () => {
    const s = state([
      clip("G", "vid", {
        mediaType: "group",
        durationMs: 4000,
        transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 20, anchor: { x: 0.5, y: 0.5 } }
      }),
      clip("C", "aud", { durationMs: 4000, parentId: "G" })
    ]);
    await expect(
      run(s, "delete_time", { fromMs: 0, toMs: 4000, trackIds: ["vid"] })
    ).rejects.toThrow(/group/);
  });
});

describe("CE4 paste_range (D61)", () => {
  const content = () => ({
    lengthMs: 2000,
    clips: [
      clip("src", "aud", { startMs: 500, durationMs: 1000, trackBinding: { trackId: "mt1", mode: "position" } as never })
    ],
    mediaTracks: [
      { id: "mt1", clipId: "src", kind: "point", name: "S", samples: [], status: "ready", sourceAssetId: "a", sourceStartMs: 0, sourceEndMs: 1000 } as never
    ],
    chords: [{ trackId: "chd", chords: [chord("x", 0, 960)] }],
    automation: [
      {
        trackId: "aud",
        laneId: "l",
        target: { kind: "mixer", param: "volumeDb" },
        points: [{ timeMs: 0, value: -6 }, { timeMs: 1000, value: 0 }]
      }
    ],
    markers: [{ id: "m", timeMs: 100, label: "M" }]
  });

  it("insert mode shifts the tail and places every kind of content in one op", async () => {
    const s = state([clip("tail", "aud", { startMs: 5000, durationMs: 1000 })]);
    s.tracks[1]!.automation = [lane([{ timeMs: 0, value: 0 }])];
    const out = await run(s, "paste_range", { atMs: 4000, mode: "insert", content: content() });
    const tail = out.state.clips.find((c) => c.id === "tail")!;
    expect(tail.startMs).toBe(7000);
    const pasted = out.state.clips.find((c) => c.id !== "tail")!;
    expect(pasted.startMs).toBe(4500);
    expect(pasted.id).not.toBe("src");
    const mt = (out.state.mediaTracks ?? []).find((t) => t.clipId === pasted.id)!;
    expect(mt).toBeDefined();
    expect(pasted.trackBinding?.trackId).toBe(mt.id);
    expect(out.state.tracks[2]!.chords!.length).toBe(1);
    expect(out.state.tracks[2]!.chords![0]!.startTick).toBeGreaterThan(0);
    const pts = out.state.tracks[1]!.automation![0]!.points;
    expect(automationValueAt(pts, 4001)).toBeCloseTo(-6, 0);
    expect(automationValueAt(pts, 5000)).toBeCloseTo(0);
    expect(out.state.markers.some((m) => m.timeMs === 4100)).toBe(true);
  });

  it("overwrite mode replaces what the range covers and shifts nothing", async () => {
    const s = state([
      clip("under", "aud", { startMs: 4000, durationMs: 2000 }),
      clip("tail", "aud", { startMs: 7000, durationMs: 1000 })
    ]);
    const out = await run(s, "paste_range", { atMs: 4000, mode: "overwrite", content: content() });
    expect(out.state.clips.find((c) => c.id === "tail")!.startMs).toBe(7000);
    expect(out.state.clips.find((c) => c.id === "under")).toBeUndefined();
    expect(out.state.clips.some((c) => c.startMs === 4500)).toBe(true);
  });

  it("refuses a locked destination track and leaves the document alone", async () => {
    const s = state([]);
    s.tracks[1]!.locked = true;
    await expect(
      run(s, "paste_range", { atMs: 4000, mode: "insert", content: content() })
    ).rejects.toThrow(/locked/);
  });

  it("readSectionContent reads a locked track without a guard", () => {
    const s = state([clip("A", "aud", { startMs: 0, durationMs: 2000 })]);
    s.tracks[1]!.locked = true;
    let n = 0;
    const out = readSectionContent(s, { fromMs: 0, toMs: 4000 }, () => `id_${++n}`);
    expect(out.clips).toHaveLength(1);
    expect(out.lengthMs).toBe(4000);
  });
});

describe("CE4 round 4 automation (F27 F28 F29)", () => {
  const paste = (s: TimelineOpState, window: Array<{ timeMs: number; value: number }>, extra = {}) =>
    run(s, "paste_range", {
      atMs: 2000,
      mode: "overwrite",
      content: {
        lengthMs: 2000,
        clips: [],
        automation: [
          { trackId: "aud", laneId: "l", target: { kind: "mixer", param: "volumeDb" }, points: window, ...extra }
        ]
      }
    });

  it("F27: paste leaves automation outside the window unchanged", async () => {
    const s = state([]);
    s.tracks[1]!.automation = [lane([{ timeMs: 0, value: 0 }])];
    const out = await paste(s, [{ timeMs: 0, value: 1 }, { timeMs: 2000, value: 1 }]);
    const pts = out.state.tracks[1]!.automation![0]!.points;
    expect(automationValueAt(pts, 1999)).toBeCloseTo(0);
    expect(automationValueAt(pts, 3000)).toBeCloseTo(1);
    expect(automationValueAt(pts, 4001)).toBeCloseTo(0);
    expect(automationValueAt(pts, 9000)).toBeCloseTo(0);
  });

  it("F28: copy carries held automation", () => {
    const s = state([]);
    s.tracks[1]!.automation = [lane([{ timeMs: 0, value: -12 }])];
    const out = readSectionContent(s, { fromMs: 1000, toMs: 2000 }, () => "id");
    expect(out.automation).toHaveLength(1);
    expect(automationValueAt(out.automation[0]!.points, 500)).toBeCloseTo(-12);
  });

  it("F28: a lane whose points all follow the window is not copied", () => {
    const s = state([]);
    s.tracks[1]!.automation = [lane([{ timeMs: 5000, value: -12 }])];
    const out = readSectionContent(s, { fromMs: 1000, toMs: 2000 }, () => "id");
    expect(out.automation).toHaveLength(0);
  });

  it("F29: copy keeps a disabled lane and paste recreates it disabled", async () => {
    const s = state([]);
    s.tracks[1]!.automation = [{ ...lane([{ timeMs: 0, value: -3 }, { timeMs: 3000, value: -6 }]), enabled: false } as never];
    const content = readSectionContent(s, { fromMs: 0, toMs: 2000 }, () => "id");
    expect(content.automation[0]!.enabled).toBe(false);
    const dst = state([]);
    const out = await run(dst, "paste_range", { atMs: 0, mode: "overwrite", content });
    expect(out.state.tracks[1]!.automation![0]!.enabled).toBe(false);
  });
});
