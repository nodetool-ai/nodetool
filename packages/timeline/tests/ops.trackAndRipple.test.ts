/**
 * set_track, ripple_delete, close_gap and cut_transcript: the track settings
 * and the gap-free edits both agent hosts run through applyTimelineOp.
 */

import { describe, expect, it } from "vitest";
import { makeClip, makeTrack } from "../src/defaults.js";
import { applyTimelineOp } from "../src/ops/apply.js";
import { timelineOpFromToolArgs } from "../src/ops/index.js";
import type { TimelineOpName } from "../src/ops/op.js";
import type { TimelineOpState } from "../src/ops/types.js";
import type { TimelineClip, TimelineTrack } from "../src/types.js";

const ctx = () => {
  let n = 0;
  return { newId: (kind: string) => `${kind}_${++n}` };
};

function tracks(): TimelineTrack[] {
  return [
    makeTrack({ id: "track_v", type: "video", name: "Video", index: 0 }),
    makeTrack({ id: "track_a", type: "audio", name: "Voice", index: 1 })
  ];
}

function clip(id: string, trackId: string, startMs: number, durationMs: number, extra: Partial<TimelineClip> = {}): TimelineClip {
  return makeClip({
    id,
    trackId,
    name: id,
    startMs,
    durationMs,
    inPointMs: 0,
    outPointMs: durationMs,
    mediaType: trackId === "track_a" ? "audio" : "video",
    sourceType: "imported",
    status: "generated",
    currentAssetId: `asset_${id}`,
    ...extra
  });
}

function state(clips: TimelineClip[], trackList = tracks()): TimelineOpState {
  return { fps: 30, width: 1920, height: 1080, tracks: trackList, clips, markers: [], playheadMs: 0, selectedClipIds: [] };
}

function run(name: TimelineOpName, s: TimelineOpState, args: Record<string, unknown>) {
  return applyTimelineOp(s, timelineOpFromToolArgs(name, args), ctx());
}

const starts = (s: TimelineOpState) => Object.fromEntries(s.clips.map((c) => [c.id, c.startMs]));

describe("set_track", () => {
  it("writes the given fields and leaves the rest", async () => {
    const out = await run("set_track", state([]), { track: "voice", muted: true, volumeDb: -6, pan: 0.5, name: "VO" });
    expect(out.error).toBeUndefined();
    const voice = out.state.tracks.find((t) => t.id === "track_a")!;
    expect(voice).toMatchObject({ name: "VO", muted: true, volumeDb: -6, pan: 0.5, visible: true, locked: false });
  });

  it("refuses volume on a video track", async () => {
    const out = await run("set_track", state([]), { track: "Video", volumeDb: -3 });
    expect(out.error).toMatch(/audio and midi tracks only/);
  });

  it("takes an unlock on a locked track and refuses other changes with it", async () => {
    const locked = tracks().map((t) => (t.id === "track_a" ? { ...t, locked: true } : t));
    expect((await run("set_track", state([], locked), { track: "Voice", muted: true })).error).toMatch(/locked/);
    const out = await run("set_track", state([], locked), { track: "Voice", locked: false });
    expect(out.state.tracks.find((t) => t.id === "track_a")!.locked).toBe(false);
  });

  it("rejects an unknown field", () => {
    expect(() => timelineOpFromToolArgs("set_track", { track: "Voice", gain: 3 })).toThrow();
  });
});

describe("ripple_delete", () => {
  it("removes the clip and pulls later clips left on every track", async () => {
    const s = state([clip("a", "track_v", 0, 1000), clip("b", "track_v", 1000, 1000), clip("c", "track_v", 2000, 1000), clip("vo", "track_a", 2500, 500)]);
    const out = await run("ripple_delete", s, { targets: ["b"] });
    expect(out.error).toBeUndefined();
    expect(starts(out.state)).toEqual({ a: 0, c: 1000, vo: 1500 });
    expect(out.result).toMatchObject({ gapClosed: true, removedClipIds: ["b"] });
  });

  it("leaves clips on a locked track where they are", async () => {
    const locked = tracks().map((t) => (t.id === "track_a" ? { ...t, locked: true } : t));
    const s = state([clip("a", "track_v", 0, 1000), clip("b", "track_v", 1000, 1000), clip("vo", "track_a", 2500, 500)], locked);
    const out = await run("ripple_delete", s, { targets: ["a"] });
    expect(starts(out.state)).toEqual({ b: 0, vo: 2500 });
  });
});

describe("close_gap", () => {
  it("closes the gap at a time", async () => {
    const s = state([clip("a", "track_v", 0, 1000), clip("b", "track_v", 3000, 1000)]);
    const out = await run("close_gap", s, { track: "Video", atMs: 2000 });
    expect(starts(out.state)).toEqual({ a: 0, b: 1000 });
    expect(out.result).toMatchObject({ closed: true, gap: { startMs: 1000, endMs: 3000 } });
  });

  it("reports when a clip covers the time", async () => {
    const s = state([clip("a", "track_v", 0, 1000), clip("b", "track_v", 3000, 1000)]);
    const out = await run("close_gap", s, { track: "Video", atMs: 500 });
    expect(out.result).toMatchObject({ closed: false });
    expect(starts(out.state)).toEqual({ a: 0, b: 3000 });
  });
});

describe("cut_transcript", () => {
  const words = [
    { word: "Hello", startMs: 0, endMs: 400 },
    { word: "um", startMs: 400, endMs: 700 },
    { word: "world", startMs: 700, endMs: 1200 }
  ];

  it("removes filler words and the media under them", async () => {
    const s = state([clip("vo", "track_a", 0, 1200, { caption: { words } }), clip("next", "track_a", 1200, 500)]);
    const out = await run("cut_transcript", s, { fillers: true });
    expect(out.error).toBeUndefined();
    const text = out.state.clips.flatMap((c) => c.caption?.words.map((w) => w.word) ?? []);
    expect(text).toEqual(["Hello", "world"]);
    expect(out.state.clips.find((c) => c.id === "next")!.startMs).toBe(900);
  });

  it("cuts a time span", async () => {
    const s = state([clip("vo", "track_a", 0, 1200, { caption: { words } })]);
    const out = await run("cut_transcript", s, { startMs: 0, endMs: 400 });
    const text = out.state.clips.flatMap((c) => c.caption?.words.map((w) => w.word) ?? []);
    expect(text).toEqual(["um", "world"]);
  });

  it("refuses a span over a locked clip's word", async () => {
    const s = state([clip("vo", "track_a", 0, 1200, { caption: { words }, locked: true })]);
    expect((await run("cut_transcript", s, { startMs: 0, endMs: 400 })).error).toMatch(/locked/);
  });

  it("asks for a span or fillers", async () => {
    expect((await run("cut_transcript", state([]), {})).error).toMatch(/startMs and endMs/);
  });
});
