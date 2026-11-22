/**
 * Agent parity: every MIDI, music and timeline edit the editor offers has an
 * op. These cases cover the piano-roll note functions, controller lanes,
 * track automation, track and master effects, and the project key.
 */
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

function state(clips: TimelineClip[], extra: Partial<TimelineOpState> = {}): TimelineOpState {
  return {
    fps: 30,
    width: 1920,
    height: 1080,
    tracks: [
      makeTrack({ id: "keys", type: "midi", name: "Keys", index: 0 }),
      makeTrack({ id: "aud", type: "audio", name: "Aud", index: 1 }),
      makeTrack({ id: "vid", type: "video", name: "Vid", index: 2 })
    ],
    clips,
    markers: [],
    tempo: { ...DEFAULT_TEMPO },
    playheadMs: 0,
    selectedClipIds: [],
    ...extra
  } as TimelineOpState;
}

const note = (id: string, pitch: number, startTick: number, durationTick: number, extra = {}) => ({
  id,
  pitch,
  velocity: 90,
  startTick,
  durationTick,
  ...extra
});

const midi = (notes: ReturnType<typeof note>[], extra: Partial<TimelineClip> = {}) =>
  makeClip({
    id: "m",
    trackId: "keys",
    name: "M",
    startMs: 0,
    durationMs: 8000,
    mediaType: "midi",
    notes,
    ...extra
  });

async function run(s: TimelineOpState, tool: string, args: Record<string, unknown>) {
  const out = await applyTimelineOp(s, timelineOpFromToolArgs(tool as never, args), ctx());
  if (out.error) throw new Error(out.error);
  return out;
}
const notesOf = (out: Awaited<ReturnType<typeof run>>) =>
  out.state.clips.find((c) => c.id === "m")!.notes!;

describe("set_notes", () => {
  it("scale_quantize pulls the chosen notes into the scale", async () => {
    const s = state([midi([note("a", 61, 0, 240), note("b", 63, 240, 240)])]);
    const out = await run(s, "set_notes", {
      clip: "m",
      function: "scale_quantize",
      root: 0,
      scale: "major",
      note_ids: ["a"]
    });
    const n = notesOf(out);
    expect(n.find((x) => x.id === "a")!.pitch).toBe(60);
    expect(n.find((x) => x.id === "b")!.pitch).toBe(63);
  });

  it("scale_quantize needs a scale", async () => {
    const s = state([midi([note("a", 61, 0, 240)])]);
    await expect(run(s, "set_notes", { clip: "m", function: "scale_quantize" })).rejects.toThrow(/scale/);
  });

  it("legato extends a note to the next onset", async () => {
    const s = state([midi([note("a", 60, 0, 100), note("b", 62, 480, 100)])]);
    const out = await run(s, "set_notes", { clip: "m", function: "legato" });
    expect(notesOf(out).find((x) => x.id === "a")!.durationTick).toBe(480);
  });

  it("remove_overlaps cuts a note at the next same-pitch note", async () => {
    const s = state([midi([note("a", 60, 0, 960), note("b", 60, 480, 240)])]);
    const out = await run(s, "set_notes", { clip: "m", function: "remove_overlaps" });
    expect(notesOf(out).find((x) => x.id === "a")!.durationTick).toBe(480);
  });

  it("delete_duplicates drops the twin", async () => {
    const s = state([midi([note("a", 60, 0, 240), note("b", 60, 0, 240), note("c", 62, 0, 240)])]);
    const out = await run(s, "set_notes", { clip: "m", function: "delete_duplicates" });
    expect(notesOf(out).map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("glue merges the named notes of one pitch", async () => {
    const s = state([midi([note("a", 60, 0, 240), note("b", 60, 480, 240)])]);
    const out = await run(s, "set_notes", { clip: "m", function: "glue", note_ids: ["a", "b"] });
    const n = notesOf(out);
    expect(n).toHaveLength(1);
    expect(n[0].durationTick).toBe(720);
  });

  it("glue refuses without note_ids", async () => {
    const s = state([midi([note("a", 60, 0, 240)])]);
    await expect(run(s, "set_notes", { clip: "m", function: "glue" })).rejects.toThrow(/note_ids/);
  });

  it("mute and unmute a whole row by pitch (the step editor row mute)", async () => {
    const s = state([midi([note("a", 36, 0, 240), note("b", 38, 0, 240)])]);
    const muted = await run(s, "set_notes", { clip: "m", function: "mute", pitches: [36] });
    expect(notesOf(muted).find((x) => x.id === "a")!.muted).toBe(true);
    expect(notesOf(muted).find((x) => x.id === "b")!.muted).toBeFalsy();
    const back = await run(muted.state, "set_notes", { clip: "m", function: "unmute", pitches: [36] });
    expect(notesOf(back).find((x) => x.id === "a")!.muted).toBeFalsy();
  });

  it("delete removes the selected notes", async () => {
    const s = state([midi([note("a", 36, 0, 240), note("b", 38, 0, 240)])]);
    const out = await run(s, "set_notes", { clip: "m", function: "delete", note_ids: ["a"] });
    expect(notesOf(out).map((x) => x.id)).toEqual(["b"]);
  });

  it("set_velocity writes one velocity to the selection", async () => {
    const s = state([midi([note("a", 36, 0, 240), note("b", 38, 0, 240)])]);
    const out = await run(s, "set_notes", {
      clip: "m",
      function: "set_velocity",
      velocity: 40,
      pitches: [38]
    });
    expect(notesOf(out).map((x) => x.velocity)).toEqual([90, 40]);
  });

  it("refuses notes with function, an empty call and stray selection fields", async () => {
    const s = state([midi([note("a", 36, 0, 240)])]);
    await expect(
      run(s, "set_notes", { clip: "m", function: "legato", notes: [] })
    ).rejects.toThrow(/not both/);
    await expect(run(s, "set_notes", { clip: "m" })).rejects.toThrow(/notes/);
    await expect(
      run(s, "set_notes", { clip: "m", notes: [], pitches: [36] })
    ).rejects.toThrow(/function/);
  });

  it("still replaces the whole list when only notes are sent", async () => {
    const s = state([midi([note("a", 36, 0, 240)])]);
    const out = await run(s, "set_notes", {
      clip: "m",
      notes: [{ pitch: 64, start_tick: 0, duration_tick: 240 }]
    });
    expect(notesOf(out).map((n) => n.pitch)).toEqual([64]);
  });

  it("refuses a note id the clip does not hold", async () => {
    const s = state([midi([note("a", 36, 0, 240)])]);
    await expect(
      run(s, "set_notes", { clip: "m", function: "delete", note_ids: ["zz"] })
    ).rejects.toThrow(/zz/);
  });
});

describe("note selection on the existing note ops", () => {
  it("quantize_notes takes swing and note_ids", async () => {
    // 1/8 grid = 480 ticks. The odd step is delayed by swing * half a step.
    const s = state([midi([note("a", 60, 20, 240), note("b", 62, 500, 240), note("c", 64, 500, 240)])]);
    const out = await run(s, "quantize_notes", {
      clip: "m",
      division: "1/8",
      swing: 0.5,
      note_ids: ["a", "b"]
    });
    const n = notesOf(out);
    expect(n.find((x) => x.id === "a")!.startTick).toBe(0);
    expect(n.find((x) => x.id === "b")!.startTick).toBe(600);
    expect(n.find((x) => x.id === "c")!.startTick).toBe(500);
  });

  it("transpose_clip and scale_velocity take note_ids", async () => {
    const s = state([midi([note("a", 60, 0, 240), note("b", 62, 240, 240)])]);
    const t = await run(s, "transpose_clip", { clip: "m", semitones: 2, note_ids: ["a"] });
    expect(notesOf(t).map((x) => x.pitch)).toEqual([62, 62]);
    const v = await run(s, "scale_velocity", { clip: "m", factor: 0.5, note_ids: ["b"] });
    expect(notesOf(v).map((x) => x.velocity)).toEqual([90, 45]);
  });
});

describe("set_notes with controller lanes", () => {
  it("creates a lane, replaces it and removes it with no points", async () => {
    const s = state([midi([note("a", 60, 0, 240)])]);
    const made = await run(s, "set_notes", {
      clip: "m",
      controllers: [{ kind: "cc", cc: 1, points: [{ tick: 0, value: 0 }, { tick: 960, value: 127 }] }]
    });
    const lanes = made.state.clips[0].controllers!;
    expect(lanes).toHaveLength(1);
    expect(lanes[0].cc).toBe(1);
    expect(lanes[0].points.map((p) => p.value)).toEqual([0, 127]);
    const changed = await run(made.state, "set_notes", {
      clip: "m",
      controllers: [{ kind: "cc", cc: 1, interpolation: "step", points: [{ tick: 480, value: 64 }] }]
    });
    expect(changed.state.clips[0].controllers).toHaveLength(1);
    expect(changed.state.clips[0].controllers![0].points).toHaveLength(1);
    expect(changed.state.clips[0].controllers![0].interpolation).toBe("step");
    const gone = await run(changed.state, "set_notes", {
      clip: "m",
      controllers: [{ kind: "cc", cc: 1, points: [] }]
    });
    expect(gone.state.clips[0].controllers ?? []).toHaveLength(0);
  });

  it("keeps other lanes and takes pitch bend", async () => {
    const s = state([midi([note("a", 60, 0, 240)])]);
    const a = await run(s, "set_notes", {
      clip: "m",
      controllers: [{ kind: "cc", cc: 74, points: [{ tick: 0, value: 10 }] }]
    });
    const b = await run(a.state, "set_notes", {
      clip: "m",
      controllers: [{ kind: "pitchBend", points: [{ tick: 0, value: -8192 }, { tick: 480, value: 8191 }] }]
    });
    expect(b.state.clips[0].controllers!.map((l) => l.kind).sort()).toEqual(["cc", "pitchBend"]);
  });

  it("refuses a value out of range and a cc lane without cc", async () => {
    const s = state([midi([note("a", 60, 0, 240)])]);
    await expect(
      run(s, "set_notes", { clip: "m", controllers: [{ kind: "cc", cc: 1, points: [{ tick: 0, value: 300 }] }] })
    ).rejects.toThrow();
    await expect(
      run(s, "set_notes", { clip: "m", controllers: [{ kind: "cc", points: [{ tick: 0, value: 1 }] }] })
    ).rejects.toThrow(/cc/);
  });
});

describe("set_track with automation", () => {
  it("writes a mixer lane and the mode, replaces by target and removes", async () => {
    const s = state([]);
    const a = await run(s, "set_track", {
      track: "keys",
      automationMode: "touch",
      automation: [
        {
          target: { kind: "mixer", param: "volumeDb" },
          points: [
            { timeMs: 0, value: -12 },
            { timeMs: 1000, value: 0, easing: "easeInOut" }
          ]
        }
      ]
    });
    const track = a.state.tracks.find((t) => t.id === "keys")!;
    expect(track.automationMode).toBe("touch");
    expect(track.automation).toHaveLength(1);
    expect(track.automation![0].points[1].easing).toBe("easeInOut");
    const b = await run(a.state, "set_track", {
      track: "keys",
      automation: [{ target: { kind: "mixer", param: "volumeDb" }, enabled: false, points: [{ timeMs: 0, value: -6 }] }]
    });
    const t2 = b.state.tracks.find((t) => t.id === "keys")!;
    expect(t2.automation).toHaveLength(1);
    expect(t2.automation![0].enabled).toBe(false);
    expect(t2.automation![0].points).toHaveLength(1);
    const c = await run(b.state, "set_track", {
      track: "keys",
      automation: [{ target: { kind: "mixer", param: "volumeDb" }, points: [] }]
    });
    expect(c.state.tracks.find((t) => t.id === "keys")!.automation ?? []).toHaveLength(0);
  });

  it("sorts points by time and refuses a target the track cannot take", async () => {
    const s = state([]);
    const a = await run(s, "set_track", {
      track: "aud",
      automation: [
        {
          target: { kind: "mixer", param: "pan" },
          points: [{ timeMs: 500, value: 1 }, { timeMs: 0, value: -1 }]
        }
      ]
    });
    expect(a.state.tracks.find((t) => t.id === "aud")!.automation![0].points.map((p) => p.timeMs)).toEqual([0, 500]);
    await expect(
      run(s, "set_track", {
        track: "vid",
        automation: [{ target: { kind: "mixer", param: "pan" }, points: [{ timeMs: 0, value: 0 }] }]
      })
    ).rejects.toThrow(/vid|Vid/);
  });

  it("mode alone changes only the mode", async () => {
    const out = await run(state([]), "set_track", { track: "keys", automationMode: "write" });
    expect(out.state.tracks.find((t) => t.id === "keys")!.automationMode).toBe("write");
  });
});

describe("track effects, folder and music role", () => {
  const eq = { id: "fx1", type: "gain", enabled: true, gainDb: 3 };
  it("set_track writes the insert chain, folder and role", async () => {
    const out = await run(state([]), "set_track", {
      track: "aud",
      effects: [eq],
      folder: "Drums",
      musicRole: "drums"
    });
    const t = out.state.tracks.find((x) => x.id === "aud")!;
    expect(t.effects).toHaveLength(1);
    expect(t.musicRole).toBe("drums");
    const folder = out.state.trackFolders!.find((f) => f.name === "Drums")!;
    expect(t.folderId).toBe(folder.id);
    const back = await run(out.state, "set_track", { track: "aud", folder: null, effects: [] });
    expect(back.state.tracks.find((x) => x.id === "aud")!.folderId).toBeUndefined();
    expect(back.state.tracks.find((x) => x.id === "aud")!.effects ?? []).toHaveLength(0);
  });
});

describe("set_track on the master bus", () => {
  it("refuses a track field the master bus does not have", async () => {
    await expect(
      run(state([]), "set_track", { track: "master", name: "Bus" })
    ).rejects.toThrow(/master/);
  });

  it("sets the master fader and effects and get_state reports them", async () => {
    const out = await run(state([]), "set_track", {
      track: "master",
      volumeDb: -3,
      effects: [{ id: "m1", type: "gain", enabled: true, gainDb: 1 }]
    });
    expect(out.state.master!.volumeDb).toBe(-3);
    expect(out.state.master!.effects).toHaveLength(1);
    const read = await run(out.state, "get_state", {});
    expect((read.result as { master: { volumeDb: number } }).master.volumeDb).toBe(-3);
  });
  it("sends only the fields to change", async () => {
    const a = await run(state([]), "set_track", { track: "master", volumeDb: -3, effects: [] });
    const b = await run(a.state, "set_track", { track: "master", effects: [{ id: "m1", type: "gain", enabled: true, gainDb: 1 }] });
    expect(b.state.master!.volumeDb).toBe(-3);
  });
  it("sets master pan, preserves other fields, and serializes default 0 in get_state", async () => {
    const initialRead = await run(state([]), "get_state", {});
    expect((initialRead.result as { master: { volumeDb: number; pan?: number } }).master).toEqual({
      volumeDb: 0,
      pan: 0
    });
    const panned = await run(state([]), "set_track", { track: "master", pan: -0.5 });
    expect((panned.state.master as { volumeDb: number; pan?: number })).toEqual({
      volumeDb: 0,
      pan: -0.5
    });
    const faded = await run(panned.state, "set_track", { track: "master", volumeDb: -2 });
    expect((faded.state.master as { volumeDb: number; pan?: number })).toEqual({
      volumeDb: -2,
      pan: -0.5
    });
    const read = await run(faded.state, "get_state", {});
    expect((read.result as { master: { volumeDb: number; pan?: number } }).master).toEqual({
      volumeDb: -2,
      pan: -0.5
    });
  });
});

describe("set_tempo key and music settings", () => {
  it("keeps the key when the tempo changes and sets it on request", async () => {
    const s = state([], { tempo: { ...DEFAULT_TEMPO, key: { tonic: "A", mode: "minor" } } });
    const a = await run(s, "set_tempo", { bpm: 100 });
    expect(a.state.tempo!.key).toEqual({ tonic: "A", mode: "minor" });
    const b = await run(a.state, "set_tempo", { bpm: 100, key: { tonic: "C", mode: "major" } });
    expect(b.state.tempo!.key).toEqual({ tonic: "C", mode: "major" });
    const c = await run(b.state, "set_tempo", { bpm: 100, key: null });
    expect(c.state.tempo!.key).toBeUndefined();
  });
  it("sets the auto crossfade length on a music project", async () => {
    const out = await run(state([], { music: {} }), "set_tempo", { bpm: 120, auto_crossfade_ms: 25 });
    expect(out.state.music!.autoCrossfadeMs).toBe(25);
  });
});

describe("get_state detail", () => {
  it("reads one midi clip in full and one track's automation and effects", async () => {
    const s = state([midi([note("a", 60, 0, 240)])]);
    const withCtl = await run(s, "set_notes", {
      clip: "m",
      controllers: [{ kind: "cc", cc: 1, points: [{ tick: 0, value: 5 }] }]
    });
    const r = await run(withCtl.state, "get_state", { clip: "m" });
    const detail = (r.result as { clipDetail: { notes: unknown[]; controllers: unknown[] } }).clipDetail;
    expect(detail.notes).toHaveLength(1);
    expect(detail.controllers).toHaveLength(1);
    const withAuto = await run(withCtl.state, "set_track", {
      track: "keys",
      automation: [{ target: { kind: "mixer", param: "pan" }, points: [{ timeMs: 0, value: 0 }] }]
    });
    const t = await run(withAuto.state, "get_state", { track: "keys" });
    const td = (t.result as { trackDetail: { automation: unknown[]; effects: unknown[] } }).trackDetail;
    expect(td.automation).toHaveLength(1);
    const tracks = (t.result as { tracks: { id: string; automationLaneCount: number }[] }).tracks;
    expect(tracks.find((x) => x.id === "keys")!.automationLaneCount).toBe(1);
  });
});
