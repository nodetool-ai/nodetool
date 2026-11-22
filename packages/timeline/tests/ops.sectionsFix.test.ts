import { describe, expect, it } from "vitest";
import { makeClip, makeTrack, type TimelineClip } from "../src/index.js";
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

describe("CE4 review fixes", () => {
  it("F1: insert_time refuses when a locked clip crosses the point, names it", async () => {
    const s = state([clip("Vox", "aud", { locked: true })]);
    await expect(run(s, "insert_time", { atMs: 3000, ms: 2000 })).rejects.toThrow(/Vox/);
  });

  it("F1: insert_time refuses for a clip on a locked track", async () => {
    const s = state([clip("Vox", "aud")]);
    s.tracks[1]!.locked = true;
    await expect(run(s, "insert_time", { atMs: 3000, ms: 2000 })).rejects.toThrow(/Vox/);
  });

  it("F1: insert_time moves a locked clip that starts after the point", async () => {
    const s = state([clip("Vox", "aud", { startMs: 4000, durationMs: 1000, locked: true })]);
    const out = await run(s, "insert_time", { atMs: 3000, ms: 2000 });
    expect(out.state.clips[0]!.startMs).toBe(6000);
  });

  it("F1: duplicate_range refuses when a locked clip crosses the end of the range", async () => {
    const s = state([clip("Vox", "aud", { locked: true })]);
    await expect(run(s, "duplicate_range", { fromMs: 0, toMs: 4000 })).rejects.toThrow(/Vox/);
  });

  it("F2: linked clips cut together keep right halves linked, left halves keep the link", async () => {
    const s = state([clip("V", "vid", { linkId: "L1" }), clip("A", "aud", { linkId: "L1" })]);
    const out = await run(s, "insert_time", { atMs: 4000, ms: 2000 });
    const by = (t: string) => out.state.clips.filter((c) => c.trackId === t).sort((a, b) => a.startMs - b.startMs);
    const [vl, vr] = by("vid");
    const [al, ar] = by("aud");
    expect(vl!.linkId).toBe("L1");
    expect(al!.linkId).toBe("L1");
    expect(vr!.linkId).toBeDefined();
    expect(vr!.linkId).toBe(ar!.linkId);
    expect(vr!.linkId).not.toBe("L1");
  });

  it("F2: a cut of one member of a link group leaves no singleton link", async () => {
    const s = state([clip("V", "vid", { linkId: "L1" }), clip("A", "aud", { linkId: "L1" })]);
    const out = await run(s, "insert_time", { atMs: 4000, ms: 2000, trackIds: ["vid"] });
    const counts = new Map<string, number>();
    for (const c of out.state.clips) if (c.linkId) counts.set(c.linkId, (counts.get(c.linkId) ?? 0) + 1);
    for (const n of counts.values()) expect(n).toBeGreaterThanOrEqual(2);
  });

  it("F2: delete_time that removes one linked partner clears the survivor's link", async () => {
    const s = state([clip("V", "vid", { linkId: "L1" }), clip("A", "aud", { linkId: "L1" })]);
    const out = await run(s, "delete_time", { fromMs: 0, toMs: 8000, trackIds: ["aud"] });
    expect(out.state.clips.find((c) => c.id === "V")!.linkId).toBeUndefined();
  });

  it("F5: delete_time never yields a negative start", async () => {
    const bar = 60000 / 140 * 4 / 1; // 1714.2857...
    const s = state([clip("A", "aud", { startMs: bar - 4.8e-7, durationMs: 1000 })], {
      tempo: { ...DEFAULT_TEMPO, bpm: 140 }
    });
    const out = await run(s, "delete_time", { fromBar: 1, toBar: 2 });
    for (const c of out.state.clips) expect(c.startMs).toBeGreaterThanOrEqual(0);
  });

  it("F6: duplicate_range clips a range marker to the section and finds a left-crossing one", async () => {
    const s = state([], {
      markers: [
        { id: "v", timeMs: 2000, durationMs: 6000, label: "Verse" },
        { id: "i", timeMs: 0, durationMs: 3000, label: "Intro" }
      ]
    });
    const out = await run(s, "duplicate_range", { fromMs: 2000, toMs: 4000 });
    const copies = out.state.markers.filter((m) => m.id !== "v" && m.id !== "i");
    const verse = copies.find((m) => m.label === "Verse")!;
    expect([verse.timeMs, verse.durationMs]).toEqual([4000, 2000]);
    const intro = copies.find((m) => m.label === "Intro")!;
    expect([intro.timeMs, intro.durationMs]).toEqual([4000, 1000]);
  });

  it("F8: delete_time clears a trackBinding to a removed media track", async () => {
    const s = state([
      clip("V", "vid", { startMs: 0, durationMs: 2000 }),
      clip("B", "vid", {
        startMs: 4000,
        durationMs: 1000,
        trackBinding: { trackId: "mt1", mode: "position" } as never
      })
    ]);
    (s as { mediaTracks?: unknown[] }).mediaTracks = [{ id: "mt1", clipId: "V" }];
    const out = await run(s, "delete_time", { fromMs: 0, toMs: 2000 });
    expect(out.state.clips.find((c) => c.id === "B")!.trackBinding).toBeUndefined();
  });

  it("F4: duplicated chords follow the clips with a tempo offset", async () => {
    const s = state([clip("A", "aud", { startMs: 2000, durationMs: 2000 })], {
      tempo: { ...DEFAULT_TEMPO, offsetMs: 2000 }
    });
    s.tracks[2]!.chords = [
      { id: "c", startTick: 0, durationTick: 3840, root: 9, quality: "minor", inversion: 0 }
    ];
    const out = await run(s, "duplicate_range", { fromMs: 0, toMs: 4000 });
    const copy = out.state.clips.find((c) => c.id !== "A")!;
    expect(copy.startMs).toBe(6000);
    expect(out.state.tracks[2]!.chords!.map((c) => c.startTick)).toEqual([0, 7680]);
  });

  it("F4: a chord copy and the shifted tail do not overlap after rounding", async () => {
    const s = state([]);
    s.tracks[2]!.chords = [
      { id: "c1", startTick: 0, durationTick: 1922, root: 0, quality: "major", inversion: 0 },
      { id: "c2", startTick: 1922, durationTick: 1918, root: 7, quality: "major", inversion: 0 }
    ];
    const out = await run(s, "duplicate_range", { fromMs: 0.2, toMs: 1000.8 });
    const chords = [...out.state.tracks[2]!.chords!].sort((a, b) => a.startTick - b.startTick);
    for (let i = 1; i < chords.length; i++) {
      expect(chords[i]!.startTick).toBeGreaterThanOrEqual(
        chords[i - 1]!.startTick + chords[i - 1]!.durationTick
      );
    }
  });

  it("F17: a time-remapped clip crossing the cut is named in the error", async () => {
    const s = state([
      clip("Broll", "vid", {
        timeRemap: { keyframes: [{ t: 0, sourceMs: 0 }, { t: 8000, sourceMs: 4000 }] }
      })
    ]);
    await expect(run(s, "insert_time", { atMs: 3000, ms: 1000 })).rejects.toThrow(/Broll/);
  });

  const group = (over: Partial<TimelineClip> = {}) =>
    clip("G", "vid", { mediaType: "group", ...over });

  it("F3: insert_time grows a group that spans the point", async () => {
    const s = state([group(), clip("C", "vid", { startMs: 4000, durationMs: 4000, parentId: "G" })]);
    const out = await run(s, "insert_time", { atMs: 4000, ms: 2000 });
    const g = out.state.clips.find((c) => c.id === "G")!;
    const c = out.state.clips.find((x) => x.parentId === "G")!;
    expect(g.durationMs).toBe(10000);
    expect(c.startMs + c.durationMs).toBeLessThanOrEqual(g.startMs + g.durationMs);
  });

  it("F3: delete_time shortens a spanning group and ungroups children of a removed one", async () => {
    const s = state([
      group(),
      clip("C", "vid", { startMs: 0, durationMs: 1000, parentId: "G" }),
      clip("H", "vid", { mediaType: "group", startMs: 9000, durationMs: 1000 }),
      clip("K", "aud", { startMs: 9000, durationMs: 1000, parentId: "H" })
    ]);
    const out = await run(s, "delete_time", { fromMs: 2000, toMs: 4000 });
    expect(out.state.clips.find((c) => c.id === "G")!.durationMs).toBe(6000);
    const s2 = state([
      clip("H", "vid", { mediaType: "group", startMs: 1000, durationMs: 1000 }),
      clip("K", "aud", { startMs: 1000, durationMs: 1000, parentId: "H" })
    ]);
    const out2 = await run(s2, "delete_time", { fromMs: 0, toMs: 4000, trackIds: ["vid"] });
    expect(out2.state.clips.find((c) => c.id === "K")!.parentId).toBeUndefined();
  });

  it("F3: duplicate_range copies a spanning group clipped, with copied children inside it", async () => {
    const s = state([group(), clip("C", "vid", { startMs: 0, durationMs: 4000, parentId: "G" })]);
    const out = await run(s, "duplicate_range", { fromMs: 0, toMs: 4000 });
    const gCopy = out.state.clips.find((c) => c.mediaType === "group" && c.id !== "G")!;
    expect([gCopy.startMs, gCopy.durationMs]).toEqual([4000, 4000]);
    const cCopy = out.state.clips.find((c) => c.id !== "C" && c.mediaType !== "group")!;
    expect(cCopy.parentId).toBe(gCopy.id);
  });

  it("F18: insert_time rejects an infinite bars value at the schema", () => {
    expect(() =>
      timelineOpFromToolArgs("insert_time" as never, { atBar: 1, bars: Infinity })
    ).toThrow();
  });
});
