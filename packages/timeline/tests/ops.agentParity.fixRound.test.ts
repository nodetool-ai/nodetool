/**
 * Fix-round regressions for A25 agent parity (F1, F4, F5, F6, F11, F12, F13, F14, F15).
 */
import { describe, expect, it } from "vitest";
import { makeClip, makeTrack, type TimelineClip, type TimelineTrack } from "../src/index.js";
import { DEFAULT_TEMPO } from "../src/midi/tempo.js";
import {
  MUSIC_TEMPO_BPM_MESSAGE,
  MUSIC_TEMPO_SIGNATURE_MESSAGE,
  TEMPO_LOCKED_MESSAGE
} from "../src/music/tempoRules.js";
import {
  applyTimelineOp,
  timelineOpFromToolArgs,
  type TimelineOpState
} from "../src/ops/index.js";

function ctx() {
  let n = 0;
  return { newId: (kind: string) => `${kind}_${++n}` } as never;
}

function makeState(
  clips: TimelineClip[],
  extra: Partial<TimelineOpState> = {},
  tracks?: TimelineTrack[]
): TimelineOpState {
  return {
    fps: 30,
    width: 1920,
    height: 1080,
    tracks: tracks ?? [
      makeTrack({ id: "keys", type: "midi", name: "Keys", index: 0 }),
      makeTrack({ id: "aud", type: "audio", name: "Aud", index: 1 }),
      makeTrack({ id: "vid", type: "video", name: "Vid", index: 2 }),
      makeTrack({ id: "ov", type: "overlay", name: "Ov", index: 3 }),
      makeTrack({ id: "ch", type: "chord", name: "Chords", index: 4 }),
      makeTrack({ id: "sub", type: "subtitle", name: "Subs", index: 5 })
    ],
    clips,
    markers: [],
    tempo: { ...DEFAULT_TEMPO },
    playheadMs: 0,
    selectedClipIds: [],
    ...extra
  } as TimelineOpState;
}

const note = (
  id: string,
  pitch: number,
  startTick: number,
  durationTick: number,
  extra: Record<string, unknown> = {}
) => ({
  id,
  pitch,
  velocity: 90,
  startTick,
  durationTick,
  ...extra
});

const midi = (
  notes: ReturnType<typeof note>[],
  extra: Partial<TimelineClip> = {}
) =>
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

async function run(
  s: TimelineOpState,
  tool: string,
  args: Record<string, unknown>
) {
  const out = await applyTimelineOp(
    s,
    timelineOpFromToolArgs(tool as never, args),
    ctx()
  );
  if (out.error) throw new Error(out.error);
  return out;
}

const notesOf = (out: Awaited<ReturnType<typeof run>>) =>
  out.state.clips.find((c) => c.id === "m")!.notes!;

describe("F1: 12-char short IDs in note_ids, folder, and device automation", () => {
  const N1 = "aa111111111100000000000000000001";
  const N2 = "bb222222222200000000000000000002";
  const N2_AMB = "bb222222222200000000000000000099";

  it("resolves unique 12-char short note IDs in set_notes", async () => {
    const s = makeState([
      midi([note(N1, 60, 20, 240), note(N2, 64, 500, 240)])
    ]);
    const muted = await run(s, "set_notes", {
      clip: "m",
      function: "mute",
      note_ids: [N1.slice(0, 12)]
    });
    expect(notesOf(muted).find((n) => n.id === N1)!.muted).toBe(true);
    expect(notesOf(muted).find((n) => n.id === N2)!.muted).toBeFalsy();
  });

  it("resolves unique 12-char short note IDs in transpose_clip", async () => {
    const s = makeState([
      midi([note(N1, 60, 20, 240), note(N2, 64, 500, 240)])
    ]);
    const transposed = await run(s, "transpose_clip", {
      clip: "m",
      semitones: 2,
      note_ids: [N1.slice(0, 12)]
    });
    expect(notesOf(transposed).find((n) => n.id === N1)!.pitch).toBe(62);
    expect(notesOf(transposed).find((n) => n.id === N2)!.pitch).toBe(64);
  });

  it("resolves unique 12-char short note IDs in quantize_notes", async () => {
    const s = makeState([
      midi([note(N1, 60, 20, 240), note(N2, 64, 500, 240)])
    ]);
    const quantized = await run(s, "quantize_notes", {
      clip: "m",
      division: "1/8",
      note_ids: [N1.slice(0, 12)]
    });
    expect(notesOf(quantized).find((n) => n.id === N1)!.startTick).toBe(0);
    expect(notesOf(quantized).find((n) => n.id === N2)!.startTick).toBe(500);
  });

  it("resolves unique 12-char short note IDs in scale_velocity", async () => {
    const s = makeState([
      midi([note(N1, 60, 20, 240), note(N2, 64, 500, 240)])
    ]);
    const scaled = await run(s, "scale_velocity", {
      clip: "m",
      factor: 0.5,
      note_ids: [N2.slice(0, 12)]
    });
    expect(notesOf(scaled).find((n) => n.id === N2)!.velocity).toBe(45);
    expect(notesOf(scaled).find((n) => n.id === N1)!.velocity).toBe(90);
  });

  it("rejects an ambiguous 12-char note ID prefix", async () => {
    const s = makeState([
      midi([note(N2, 60, 0, 240), note(N2_AMB, 64, 240, 240)])
    ]);
    await expect(
      run(s, "set_notes", {
        clip: "m",
        function: "mute",
        note_ids: [N2.slice(0, 12)]
      })
    ).rejects.toThrow(/more than one/i);
  });

  it("resolves a unique 12-char folder ID without creating a duplicate folder", async () => {
    const F1 = "cc333333333300000000000000000001";
    const s = makeState([], {
      trackFolders: [{ id: F1, name: "Rhythm" }]
    });
    const out = await run(s, "set_track", {
      track: "aud",
      folder: F1.slice(0, 12)
    });
    expect(out.state.trackFolders).toHaveLength(1);
    expect(out.state.tracks.find((t) => t.id === "aud")!.folderId).toBe(F1);
  });

  it("rejects an ambiguous 12-char folder ID prefix", async () => {
    const F1 = "cc333333333300000000000000000001";
    const F2 = "cc333333333300000000000000000002";
    const amb = makeState([], {
      trackFolders: [
        { id: F1, name: "Rhythm" },
        { id: F2, name: "Leads" }
      ]
    });
    await expect(
      run(amb, "set_track", { track: "aud", folder: F1.slice(0, 12) })
    ).rejects.toThrow(/more than one/i);
  });

  it("resolves a unique 12-char effect ID in device automation and stores the full ID", async () => {
    const FX1 = "dd444444444400000000000000000001";
    const withFx = makeState(
      [],
      {},
      [
        makeTrack({
          id: "aud",
          type: "audio",
          name: "Aud",
          index: 0,
          effects: [{ id: FX1, type: "gain", enabled: true, gainDb: 0 }]
        })
      ]
    );
    const out = await run(withFx, "set_track", {
      track: "aud",
      automation: [
        {
          target: { kind: "device", deviceId: FX1.slice(0, 12), param: "gainDb" },
          points: [{ timeMs: 0, value: -3 }]
        }
      ]
    });
    const lane = out.state.tracks[0]!.automation![0]!;
    expect(lane.target).toEqual({
      kind: "device",
      deviceId: FX1,
      param: "gainDb"
    });
  });

  it("rejects an ambiguous 12-char effect ID prefix in device automation", async () => {
    const FX1 = "dd444444444400000000000000000001";
    const FX2 = "dd444444444400000000000000000002";
    const amb = makeState(
      [],
      {},
      [
        makeTrack({
          id: "aud",
          type: "audio",
          name: "Aud",
          index: 0,
          effects: [
            { id: FX1, type: "gain", enabled: true, gainDb: 0 },
            { id: FX2, type: "gain", enabled: true, gainDb: 2 }
          ]
        })
      ]
    );
    await expect(
      run(amb, "set_track", {
        track: "aud",
        automation: [
          {
            target: { kind: "device", deviceId: FX1.slice(0, 12), param: "gainDb" },
            points: [{ timeMs: 0, value: -3 }]
          }
        ]
      })
    ).rejects.toThrow(/more than one/i);
  });
});

describe("F4: note edits keep clip.notes sorted", () => {
  it("sorts notes after transpose_clip", async () => {
    const s = makeState([
      midi([note("n1", 61, 0, 240), note("n2", 64, 0, 240)])
    ]);
    const t = await run(s, "transpose_clip", {
      clip: "m",
      semitones: -4,
      note_ids: ["n2"]
    });
    expect(notesOf(t).map((n) => n.id)).toEqual(["n2", "n1"]);
  });

  it("sorts notes after quantize_notes and counts moved notes before sorting", async () => {
    const s = makeState([
      midi([note("n1", 60, 400, 240), note("n2", 60, 460, 240)])
    ]);
    const q = await run(s, "quantize_notes", {
      clip: "m",
      division: "1/4",
      note_ids: ["n2"]
    });
    expect(notesOf(q).map((n) => [n.id, n.startTick])).toEqual([
      ["n2", 0],
      ["n1", 400]
    ]);
    expect((q.result as { movedNoteCount: number }).movedNoteCount).toBe(1);
  });

  it("sorts notes after applyNoteFunction (scale_quantize)", async () => {
    const s = makeState([
      midi([note("z1", 61, 0, 240), note("a2", 61, 0, 240)])
    ]);
    const sq = await run(s, "set_notes", {
      clip: "m",
      function: "scale_quantize",
      root: 0,
      scale: "major"
    });
    expect(notesOf(sq).map((n) => n.id)).toEqual(["a2", "z1"]);
    const dedup = await run(sq.state, "set_notes", {
      clip: "m",
      function: "delete_duplicates"
    });
    expect(notesOf(dedup).map((n) => n.id)).toEqual(["a2"]);
  });
});

describe("F5: scale_quantize default root from project key and glue selection check", () => {
  it("defaults scale_quantize root to the document key tonic", async () => {
    const s = makeState(
      [midi([note("e4", 64, 0, 240)])],
      {
        tempo: { ...DEFAULT_TEMPO, key: { tonic: "D", mode: "minor" } }
      }
    );
    // E4 (64) is in D minor (stays 64) but NOT in C minor (would snap to 63).
    const out = await run(s, "set_notes", {
      clip: "m",
      function: "scale_quantize",
      scale: "minor"
    });
    expect(notesOf(out)[0]!.pitch).toBe(64);
  });

  it("refuses glue when duplicate note_ids resolve to fewer than two distinct notes", async () => {
    const s = makeState([
      midi([note("n1", 60, 0, 240), note("n2", 60, 240, 240)])
    ]);
    await expect(
      run(s, "set_notes", {
        clip: "m",
        function: "glue",
        note_ids: ["n1", "n1"]
      })
    ).rejects.toThrow(/two/i);
  });

  it("refuses glue when pitches filtering leaves fewer than two notes", async () => {
    const s = makeState([
      midi([note("n1", 60, 0, 240), note("n2", 60, 240, 240)])
    ]);
    await expect(
      run(s, "set_notes", {
        clip: "m",
        function: "glue",
        note_ids: ["n1", "n2"],
        pitches: [99]
      })
    ).rejects.toThrow(/two/i);
  });
});

describe("F6: set_tempo enforces MD6/MD9, guards music marker, and allows omitting bpm", () => {
  const audioClip = makeClip({
    id: "stem",
    trackId: "aud",
    name: "Stem",
    startMs: 0,
    durationMs: 4000,
    mediaType: "audio"
  });

  it("enforces MD6 tempo lock when changing bpm with audio clips", async () => {
    const s = makeState([audioClip], { music: {} });
    await expect(
      run(s, "set_tempo", { bpm: 90 })
    ).rejects.toThrow(TEMPO_LOCKED_MESSAGE);
  });

  it("allows key changes with unchanged bpm on a sequence with audio clips", async () => {
    const s = makeState([audioClip], { music: {} });
    const keyed = await run(s, "set_tempo", {
      bpm: 120,
      key: { tonic: "D", mode: "minor" }
    });
    expect(keyed.state.tempo!.key).toEqual({ tonic: "D", mode: "minor" });
    expect(keyed.state.tempo!.bpm).toBe(120);
  });

  it("enforces MD9 integer BPM on music sequences", async () => {
    const s = makeState([], { music: {} });
    await expect(
      run(s, "set_tempo", { bpm: 128.5 })
    ).rejects.toThrow(MUSIC_TEMPO_BPM_MESSAGE);
  });

  it("enforces MD9 music time signatures on music sequences", async () => {
    const s = makeState([], { music: {} });
    await expect(
      run(s, "set_tempo", { bpm: 120, beats_per_bar: 5, beat_unit: 4 })
    ).rejects.toThrow(MUSIC_TEMPO_SIGNATURE_MESSAGE);
  });

  it("refuses auto_crossfade_ms on a non-music project instead of creating document.music", async () => {
    const s = makeState([]);
    await expect(
      run(s, "set_tempo", { bpm: 120, auto_crossfade_ms: 0 })
    ).rejects.toThrow(/music/i);
    expect(s.music).toBeUndefined();
  });

  it("allows changing only key without bpm", async () => {
    const s = makeState([midi([note("a", 60, 0, 240)], { startMs: 1000, durationMs: 2000 })], {
      tempo: { bpm: 96, offsetMs: 0, timeSignature: { beatsPerBar: 4, beatUnit: 4 } },
      music: { autoCrossfadeMs: 10 }
    });
    const keyed = await run(s, "set_tempo", {
      key: { tonic: "F#", mode: "minor" }
    });
    expect(keyed.state.tempo!.bpm).toBe(96);
    expect(keyed.state.tempo!.key).toEqual({ tonic: "F#", mode: "minor" });
    expect(keyed.state.clips[0]!.startMs).toBe(1000);
    expect(keyed.state.clips[0]!.durationMs).toBe(2000);
  });

  it("allows changing only auto_crossfade_ms without bpm", async () => {
    const s = makeState([midi([note("a", 60, 0, 240)], { startMs: 1000, durationMs: 2000 })], {
      tempo: { bpm: 96, offsetMs: 0, timeSignature: { beatsPerBar: 4, beatUnit: 4 } },
      music: { autoCrossfadeMs: 10 }
    });
    const faded = await run(s, "set_tempo", {
      auto_crossfade_ms: 25
    });
    expect(faded.state.music!.autoCrossfadeMs).toBe(25);
    expect(faded.state.tempo!.bpm).toBe(96);
  });
});

describe("F11: set_track.effects domain check, duplicate IDs, and orphan device lane cleanup", () => {
  const blur = { id: "v1", type: "videoBlur", enabled: true, radius: 10 };
  const comp = {
    id: "a1",
    type: "compressor",
    enabled: true,
    thresholdDb: -18,
    ratio: 4,
    attackMs: 10,
    releaseMs: 100,
    kneeDb: 6
  };

  it("refuses picture effects on master", async () => {
    const s = makeState([]);
    await expect(
      run(s, "set_track", { track: "master", effects: [blur] })
    ).rejects.toThrow(/audio|master/i);
  });

  it("refuses picture effects on audio tracks", async () => {
    const s = makeState([]);
    await expect(
      run(s, "set_track", { track: "aud", effects: [blur] })
    ).rejects.toThrow(/audio/i);
  });

  it("refuses audio effects on video tracks", async () => {
    const s = makeState([]);
    await expect(
      run(s, "set_track", { track: "vid", effects: [comp] })
    ).rejects.toThrow(/video|picture/i);
  });

  it("refuses insert effects on chord tracks", async () => {
    const s = makeState([]);
    await expect(
      run(s, "set_track", { track: "ch", effects: [comp] })
    ).rejects.toThrow(/chord/i);
  });

  it("refuses insert effects on subtitle tracks", async () => {
    const s = makeState([]);
    await expect(
      run(s, "set_track", { track: "sub", effects: [blur] })
    ).rejects.toThrow(/subtitle/i);
  });

  it("refuses duplicate effect IDs on a track", async () => {
    const dup = [
      { id: "fx1", type: "gain", enabled: true, gainDb: 1 },
      { id: "fx1", type: "gain", enabled: true, gainDb: 2 }
    ];
    await expect(
      run(makeState([]), "set_track", { track: "aud", effects: dup })
    ).rejects.toThrow(/duplicate/i);
  });

  it("refuses duplicate effect IDs on master", async () => {
    const dup = [
      { id: "fx1", type: "gain", enabled: true, gainDb: 1 },
      { id: "fx1", type: "gain", enabled: true, gainDb: 2 }
    ];
    await expect(
      run(makeState([]), "set_track", { track: "master", effects: dup })
    ).rejects.toThrow(/duplicate/i);
  });

  it("removes orphaned device automation lanes when an effect is removed", async () => {
    const s = makeState(
      [],
      {},
      [
        makeTrack({
          id: "keys",
          type: "midi",
          name: "Keys",
          index: 0,
          effects: [{ id: "fx1", type: "gain", enabled: true, gainDb: 0 }],
          automation: [
            {
              id: "l1",
              target: { kind: "device", deviceId: "fx1", param: "gainDb" },
              points: [{ timeMs: 0, value: -3 }]
            },
            {
              id: "l2",
              target: { kind: "mixer", param: "volumeDb" },
              points: [{ timeMs: 0, value: -1 }]
            },
            {
              id: "l3",
              target: { kind: "device", deviceId: "instrument", param: "cutoffHz" },
              points: [{ timeMs: 0, value: 800 }]
            }
          ]
        })
      ]
    );
    const out = await run(s, "set_track", { track: "keys", effects: [] });
    const lanes = out.state.tracks[0]!.automation ?? [];
    expect(lanes.map((l) => l.id)).toEqual(["l2", "l3"]);
  });
});

describe("F12: set_track.automation cap, disabled preservation, and automationMode", () => {
  it("refuses exceeding 256 automation lanes across multiple calls", async () => {
    const existing = Array.from({ length: 255 }, (_, i) => ({
      id: `l${i}`,
      target: { kind: "device" as const, deviceId: "instrument", param: `p${i}` },
      points: [{ timeMs: 0, value: i }]
    }));
    const s = makeState(
      [],
      {},
      [makeTrack({ id: "keys", type: "midi", name: "Keys", index: 0, automation: existing })]
    );
    await expect(
      run(s, "set_track", {
        track: "keys",
        automation: [
          { target: { kind: "mixer", param: "volumeDb" }, points: [{ timeMs: 0, value: 0 }] },
          { target: { kind: "mixer", param: "pan" }, points: [{ timeMs: 0, value: 0 }] }
        ]
      })
    ).rejects.toThrow(/256/);
  });

  it("preserves enabled: false on point edits when enabled is omitted", async () => {
    const s = makeState(
      [],
      {},
      [
        makeTrack({
          id: "aud",
          type: "audio",
          name: "Aud",
          index: 0,
          automation: [
            {
              id: "l1",
              target: { kind: "mixer", param: "volumeDb" },
              enabled: false,
              points: [{ timeMs: 0, value: -6 }]
            }
          ]
        })
      ]
    );
    const edited = await run(s, "set_track", {
      track: "aud",
      automation: [
        {
          target: { kind: "mixer", param: "volumeDb" },
          points: [{ timeMs: 500, value: -3 }]
        }
      ]
    });
    expect(edited.state.tracks[0]!.automation![0]!.enabled).toBe(false);

    const enabled = await run(edited.state, "set_track", {
      track: "aud",
      automation: [
        {
          target: { kind: "mixer", param: "volumeDb" },
          enabled: true,
          points: [{ timeMs: 500, value: -3 }]
        }
      ]
    });
    expect(enabled.state.tracks[0]!.automation![0]!.enabled).toBeUndefined();
  });

  it("refuses automationMode on chord tracks", async () => {
    const s = makeState([]);
    await expect(
      run(s, "set_track", { track: "ch", automationMode: "touch" })
    ).rejects.toThrow(/chord/i);
  });

  it("refuses automationMode on subtitle tracks", async () => {
    const s = makeState([]);
    await expect(
      run(s, "set_track", { track: "sub", automationMode: "write" })
    ).rejects.toThrow(/subtitle/i);
  });

  it("clears automationMode to undefined when set to read", async () => {
    const s = makeState([]);
    const touched = await run(s, "set_track", { track: "aud", automationMode: "touch" });
    expect(touched.state.tracks.find((t) => t.id === "aud")!.automationMode).toBe("touch");
    const back = await run(touched.state, "set_track", { track: "aud", automationMode: "read" });
    expect(back.state.tracks.find((t) => t.id === "aud")!.automationMode).toBeUndefined();
  });
});

describe("F13: set_notes refuses mismatched function options", () => {
  it("refuses velocity on functions other than set_velocity", async () => {
    const s = makeState([midi([note("a", 60, 0, 240)])]);
    await expect(
      run(s, "set_notes", { clip: "m", function: "legato", velocity: 90 })
    ).rejects.toThrow(/velocity/i);
    await expect(
      run(s, "set_notes", { clip: "m", function: "scale_quantize", scale: "major", velocity: 80 })
    ).rejects.toThrow(/velocity/i);
  });

  it("refuses root and scale on functions other than scale_quantize", async () => {
    const s = makeState([midi([note("a", 60, 0, 240)])]);
    await expect(
      run(s, "set_notes", { clip: "m", function: "legato", scale: "minor" })
    ).rejects.toThrow(/scale/i);
    await expect(
      run(s, "set_notes", { clip: "m", function: "legato", root: 2 })
    ).rejects.toThrow(/root/i);
    await expect(
      run(s, "set_notes", { clip: "m", function: "set_velocity", velocity: 80, scale: "major" })
    ).rejects.toThrow(/scale/i);
  });
});

describe("F14: master matching, trimmed folder, explicit undefined, and deep cloneState", () => {
  it("matches Master case-insensitively when no track is named master", async () => {
    const out = await run(makeState([]), "set_track", {
      track: "Master",
      volumeDb: -2
    });
    expect(out.state.master!.volumeDb).toBe(-2);
  });

  it("defers to a track named Master instead of routing to the master bus", async () => {
    const withTrack = makeState(
      [],
      {},
      [makeTrack({ id: "t-uuid-1", type: "audio", name: "Master", index: 0 })]
    );
    const trackOut = await run(withTrack, "set_track", {
      track: "master",
      muted: true
    });
    expect(trackOut.state.tracks[0]!.muted).toBe(true);
    expect(trackOut.state.master).toBeUndefined();
  });

  it("rejects whitespace-only folder names", async () => {
    await expect(
      run(makeState([]), "set_track", { track: "aud", folder: "   " })
    ).rejects.toThrow(/folder/i);
  });

  it("trims surrounding whitespace from folder names", async () => {
    const out = await run(makeState([]), "set_track", {
      track: "aud",
      folder: "  Drums  "
    });
    expect(out.state.trackFolders![0]!.name).toBe("Drums");
  });

  it("ignores explicit undefined properties on programmatic master set_track ops", async () => {
    const s = makeState([]);
    const masterOut = await applyTimelineOp(
      s,
      {
        op: "set_track",
        track: "master",
        volumeDb: -3,
        muted: undefined
      },
      ctx()
    );
    expect(masterOut.error).toBeUndefined();
    expect(masterOut.state.master!.volumeDb).toBe(-3);
  });

  it("ignores explicit undefined properties on a locked track set_track op", async () => {
    const lockedState = makeState(
      [],
      {},
      [makeTrack({ id: "aud", type: "audio", name: "Aud", index: 0, locked: true })]
    );
    const lockOut = await applyTimelineOp(
      lockedState,
      {
        op: "set_track",
        track: "aud",
        locked: true,
        muted: undefined
      },
      ctx()
    );
    expect(lockOut.error).toBeUndefined();
    expect(lockOut.state.tracks[0]!.locked).toBe(true);
  });

  it("deep-clones tempo in applyTimelineOp", async () => {
    const input = makeState([], {
      tempo: {
        bpm: 120,
        offsetMs: 0,
        timeSignature: { beatsPerBar: 4, beatUnit: 4 },
        key: { tonic: "C", mode: "major" }
      }
    });
    const out = await run(input, "get_state", {});
    expect(out.state.tempo).not.toBe(input.tempo);
    expect(out.state.tempo!.timeSignature).not.toBe(input.tempo!.timeSignature);
  });

  it("deep-clones music in applyTimelineOp", async () => {
    const input = makeState([], {
      music: { autoCrossfadeMs: 10, promptHistory: ["pad"] }
    });
    const out = await run(input, "get_state", {});
    expect(out.state.music).not.toBe(input.music);
    expect(out.state.music!.promptHistory).not.toBe(input.music!.promptHistory);
  });

  it("deep-clones master in applyTimelineOp", async () => {
    const input = makeState([], {
      master: {
        volumeDb: 0,
        effects: [{ id: "m1", type: "gain", enabled: true, gainDb: 0 }]
      }
    });
    const out = await run(input, "get_state", {});
    expect(out.state.master).not.toBe(input.master);
    expect(out.state.master!.effects).not.toBe(input.master!.effects);
  });

  it("deep-clones trackFolders in applyTimelineOp", async () => {
    const input = makeState([], {
      trackFolders: [{ id: "f1", name: "Band" }]
    });
    const out = await run(input, "get_state", {});
    expect(out.state.trackFolders).not.toBe(input.trackFolders);
    expect(out.state.trackFolders![0]).not.toBe(input.trackFolders![0]);
  });
});

describe("F15: set_track.effects resolves 12-char short effect IDs on track and master", () => {
  const FX1 = "dd444444444400000000000000000001";
  const FX1_AMB = "dd444444444400000000000000000002";
  const FX2 = "ee555555555500000000000000000003";

  it("resolves unique 12-char short effect ID on track, keeps full ID, and preserves its device automation lane", async () => {
    const s = makeState(
      [],
      {},
      [
        makeTrack({
          id: "aud",
          type: "audio",
          name: "Aud",
          index: 0,
          effects: [
            { id: FX1, type: "gain", enabled: true, gainDb: 0 },
            { id: FX2, type: "gain", enabled: true, gainDb: 1 }
          ],
          automation: [
            {
              id: "l1",
              target: { kind: "device", deviceId: FX1, param: "gainDb" },
              points: [{ timeMs: 0, value: -3 }]
            },
            {
              id: "l2",
              target: { kind: "device", deviceId: FX2, param: "gainDb" },
              points: [{ timeMs: 0, value: 2 }]
            }
          ]
        })
      ]
    );
    const out = await run(s, "set_track", {
      track: "aud",
      effects: [{ id: FX1.slice(0, 12), type: "gain", enabled: true, gainDb: 6 }]
    });
    const track = out.state.tracks[0]!;
    expect(track.effects).toEqual([{ id: FX1, type: "gain", enabled: true, gainDb: 6 }]);
    expect(track.automation).toEqual([
      {
        id: "l1",
        target: { kind: "device", deviceId: FX1, param: "gainDb" },
        points: [{ timeMs: 0, value: -3 }]
      }
    ]);
  });

  it("rejects an ambiguous 12-char short effect ID prefix on track", async () => {
    const s = makeState(
      [],
      {},
      [
        makeTrack({
          id: "aud",
          type: "audio",
          name: "Aud",
          index: 0,
          effects: [
            { id: FX1, type: "gain", enabled: true, gainDb: 0 },
            { id: FX1_AMB, type: "gain", enabled: true, gainDb: 2 }
          ]
        })
      ]
    );
    await expect(
      run(s, "set_track", {
        track: "aud",
        effects: [{ id: FX1.slice(0, 12), type: "gain", enabled: true, gainDb: 4 }]
      })
    ).rejects.toThrow(/more than one/i);
  });

  it("rejects duplicate track effects when full ID and its 12-char short ID are both passed", async () => {
    const s = makeState(
      [],
      {},
      [
        makeTrack({
          id: "aud",
          type: "audio",
          name: "Aud",
          index: 0,
          effects: [{ id: FX1, type: "gain", enabled: true, gainDb: 0 }]
        })
      ]
    );
    await expect(
      run(s, "set_track", {
        track: "aud",
        effects: [
          { id: FX1, type: "gain", enabled: true, gainDb: 1 },
          { id: FX1.slice(0, 12), type: "gain", enabled: true, gainDb: 2 }
        ]
      })
    ).rejects.toThrow(/duplicate/i);
  });

  it("resolves unique 12-char short effect ID on master and keeps full ID", async () => {
    const s = makeState([], {
      master: {
        volumeDb: 0,
        effects: [{ id: FX1, type: "gain", enabled: true, gainDb: 0 }]
      }
    });
    const out = await run(s, "set_track", {
      track: "master",
      effects: [{ id: FX1.slice(0, 12), type: "gain", enabled: true, gainDb: -4 }]
    });
    expect(out.state.master!.effects).toEqual([
      { id: FX1, type: "gain", enabled: true, gainDb: -4 }
    ]);
  });

  it("rejects an ambiguous 12-char short effect ID prefix on master", async () => {
    const s = makeState([], {
      master: {
        volumeDb: 0,
        effects: [
          { id: FX1, type: "gain", enabled: true, gainDb: 0 },
          { id: FX1_AMB, type: "gain", enabled: true, gainDb: 2 }
        ]
      }
    });
    await expect(
      run(s, "set_track", {
        track: "master",
        effects: [{ id: FX1.slice(0, 12), type: "gain", enabled: true, gainDb: -2 }]
      })
    ).rejects.toThrow(/more than one/i);
  });

  it("rejects duplicate master effects when full ID and its 12-char short ID are both passed", async () => {
    const s = makeState([], {
      master: {
        volumeDb: 0,
        effects: [{ id: FX1, type: "gain", enabled: true, gainDb: 0 }]
      }
    });
    await expect(
      run(s, "set_track", {
        track: "master",
        effects: [
          { id: FX1, type: "gain", enabled: true, gainDb: -1 },
          { id: FX1.slice(0, 12), type: "gain", enabled: true, gainDb: -2 }
        ]
      })
    ).rejects.toThrow(/duplicate/i);
  });

  it("does not resolve a non-12-char prefix as an existing effect ID", async () => {
    const s = makeState(
      [],
      {},
      [
        makeTrack({
          id: "aud",
          type: "audio",
          name: "Aud",
          index: 0,
          effects: [{ id: FX1, type: "gain", enabled: true, gainDb: 0 }],
          automation: [
            {
              id: "l1",
              target: { kind: "device", deviceId: FX1, param: "gainDb" },
              points: [{ timeMs: 0, value: -3 }]
            }
          ]
        })
      ]
    );
    const out = await run(s, "set_track", {
      track: "aud",
      effects: [{ id: FX1.slice(0, 11), type: "gain", enabled: true, gainDb: 3 }]
    });
    const track = out.state.tracks[0]!;
    expect(track.effects![0]!.id).toBe(FX1.slice(0, 11));
    expect(track.automation).toBeUndefined();
  });
});
