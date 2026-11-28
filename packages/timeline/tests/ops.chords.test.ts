import { describe, expect, it } from "vitest";
import {
  chordSymbol,
  COMP_LIBRARY,
  expandClipHarmony,
  makeClip,
  makeTrack,
  PROGRESSIONS,
  type TimelineChord,
  type TimelineClip,
  type TimelineTrack
} from "../src/index.js";
import { DEFAULT_TEMPO } from "../src/midi/tempo.js";
import {
  applyTimelineOp,
  timelineOpFromToolArgs,
  TIMELINE_OP_NAMES,
  type TimelineOpName,
  type TimelineOpState
} from "../src/ops/index.js";

const BAR = 3840;

function ctx() {
  let n = 0;
  return { newId: (kind: string) => `${kind}_${++n}` } as never;
}

const chord = (id: string, bar: number, bars: number, root: number, quality: TimelineChord["quality"]): TimelineChord => ({
  id,
  startTick: bar * BAR,
  durationTick: bars * BAR,
  root,
  quality,
  inversion: 0
});

function midiClip(id: string, notes: Array<[number, number, number]>, extra: Partial<TimelineClip> = {}) {
  return makeClip({
    id,
    trackId: "keys",
    name: id,
    startMs: 0,
    durationMs: 16000,
    mediaType: "midi",
    notes: notes.map(([pitch, startTick, durationTick], i) => ({
      id: `${id}_n${i}`,
      pitch,
      velocity: 100,
      startTick,
      durationTick
    })),
    ...extra
  });
}

function base(over: Partial<TimelineOpState> = {}): TimelineOpState {
  return {
    fps: 30,
    width: 1920,
    height: 1080,
    tracks: [makeTrack({ id: "keys", type: "midi", name: "Keys", index: 0 })],
    clips: [],
    markers: [],
    tempo: { ...DEFAULT_TEMPO },
    playheadMs: 0,
    selectedClipIds: [],
    ...over
  };
}

const chordTrack = (chords: TimelineChord[] = []): TimelineTrack =>
  makeTrack({ id: "chords", type: "chord", name: "Chords", index: 1, chords });

async function run(state: TimelineOpState, name: TimelineOpName, args: Record<string, unknown>) {
  const out = await applyTimelineOp(state, timelineOpFromToolArgs(name, args), ctx());
  return out;
}
const chordsOf = (s: TimelineOpState, id = "chords") => s.tracks.find((t) => t.id === id)?.chords ?? [];
const chordTrackId = (s: TimelineOpState) => s.tracks.find((t) => t.type === "chord")!.id;
const syms = (s: TimelineOpState, id: string = chordTrackId(s)) =>
  chordsOf(s, id).map((c) => `${chordSymbol(c)}@${c.startTick / BAR}+${c.durationTick / BAR}`);

describe("op names", () => {
  it("lists every chord op", () => {
    for (const n of [
      "set_chords", "clear_chords", "list_progressions", "apply_progression",
      "transpose_chords", "detect_chords", "set_clip_harmony",
      "list_harmony_presets", "fit_notes_to_chords"
    ]) {
      expect(TIMELINE_OP_NAMES).toContain(n);
    }
  });
});

describe("set_chords", () => {
  it("writes a chart string on the existing chord track", async () => {
    const out = await run(base({ tracks: [...base().tracks, chordTrack()] }), "set_chords", {
      chart: "| Am | F | C G |"
    });
    expect(out.error).toBeUndefined();
    expect(syms(out.state)).toEqual(["Am@0+1", "F@1+1", "C@2+0.5", "G@2.5+0.5"]);
    expect(out.result.chart).toBe("| Am | F | C G |");
  });

  it("creates the chord track when none exists", async () => {
    const out = await run(base(), "set_chords", { chart: "| Am | F |" });
    expect(out.error).toBeUndefined();
    const track = out.state.tracks.find((t) => t.type === "chord");
    expect(track).toBeDefined();
    expect(track!.chords).toHaveLength(2);
    expect(out.result.createdTrack).toBe(true);
  });

  it("writes a chord list with bars and beats from startBar", async () => {
    const out = await run(base({ tracks: [...base().tracks, chordTrack()] }), "set_chords", {
      startBar: 3,
      chords: [{ symbol: "Dm7", bars: 1 }, { symbol: "G7", beats: 2 }, { symbol: "Cmaj7", bars: 1, beats: 2 }]
    });
    expect(out.error).toBeUndefined();
    expect(syms(out.state)).toEqual(["Dm7@2+1", "G7@3+0.5", "Cmaj7@3.5+1.5"]);
  });

  it("replaces the covered range and keeps chords outside it", async () => {
    const state = base({
      tracks: [...base().tracks, chordTrack([chord("a", 0, 4, 0, "maj")])]
    });
    const out = await run(state, "set_chords", { startBar: 2, chart: "| Am | F |" });
    expect(syms(out.state)).toEqual(["C@0+1", "Am@1+1", "F@2+1", "C@3+1"]);
  });

  it("refuses a bad symbol with the accepted forms", async () => {
    const out = await run(base(), "set_chords", { chords: [{ symbol: "Hm" }] });
    expect(out.error).toMatch(/Hm/);
    expect(out.error).toMatch(/C C# D Eb/);
  });

  it("refuses chart and chords together, and neither", async () => {
    const both = await run(base(), "set_chords", { chart: "| C |", chords: [{ symbol: "C" }] });
    expect(both.error).toMatch(/chart.*chords/);
    const none = await run(base(), "set_chords", {});
    expect(none.error).toMatch(/chart.*chords/);
  });

  it("names the valid track ids when trackId is not a chord track", async () => {
    const out = await run(base({ tracks: [...base().tracks, chordTrack()] }), "set_chords", {
      trackId: "keys",
      chart: "| C |"
    });
    expect(out.error).toMatch(/chord track/);
    expect(out.error).toMatch(/chords/);
  });

  it("refuses a locked chord track", async () => {
    const locked = { ...chordTrack(), locked: true };
    const out = await run(base({ tracks: [...base().tracks, locked] }), "set_chords", { chart: "| C |" });
    expect(out.error).toMatch(/locked/);
  });
});

describe("clear_chords", () => {
  it("clears a bar range and trims the edges", async () => {
    const state = base({ tracks: [...base().tracks, chordTrack([chord("a", 0, 4, 0, "maj")])] });
    const out = await run(state, "clear_chords", { startBar: 2, endBar: 3 });
    expect(syms(out.state)).toEqual(["C@0+1", "C@3+1"]);
  });
  it("clears everything without bars", async () => {
    const state = base({ tracks: [...base().tracks, chordTrack([chord("a", 0, 4, 0, "maj")])] });
    const out = await run(state, "clear_chords", {});
    expect(chordsOf(out.state)).toEqual([]);
  });
  it("is a no-op that points at set_chords when there is no chord track", async () => {
    const out = await run(base(), "clear_chords", {});
    expect(out.error).toBeUndefined();
    expect(out.result.note).toMatch(/set_chords/);
  });
});

describe("list_progressions", () => {
  it("lists every library entry with a unique id", async () => {
    const out = await run(base(), "list_progressions", {});
    const list = out.result.progressions as Array<{ id: string; name: string; family: string; numerals: string[]; length: { bars: number } }>;
    expect(list).toHaveLength(PROGRESSIONS.length);
    expect(new Set(list.map((p) => p.id)).size).toBe(list.length);
    const pop = list.find((p) => p.name === "I–V–vi–IV")!;
    expect(pop.numerals).toEqual(["I", "V", "vi", "IV"]);
    expect(pop.length.bars).toBe(4);
    expect(pop.family).toBe("MAJOR");
  });
});

describe("apply_progression", () => {
  it("writes a progression in a key by id", async () => {
    const out = await run(base(), "apply_progression", { progression: "I-V-vi-IV", key: "A minor" });
    expect(out.error).toBeUndefined();
    expect(syms(out.state)).toEqual(["A@0+1", "E@1+1", "F#m@2+1", "D@3+1"]);
    expect(out.result.chart).toBe("| A | E | F#m | D |");
  });
  it("finds a progression by name, and uses the document key by default", async () => {
    const state = base({ tempo: { ...DEFAULT_TEMPO, key: { tonic: "Bb", mode: "major" } } });
    const out = await run(state, "apply_progression", { progression: "I–V–vi–IV" });
    expect(chordsOf(out.state, out.state.tracks.find((t) => t.type === "chord")!.id).map(chordSymbol)).toEqual([
      "Bb", "F", "Gm", "Eb"
    ]);
  });
  it("defaults to C major", async () => {
    const out = await run(base(), "apply_progression", { progression: "ii-V-I" });
    expect(out.result.chart).toBe("| Dm7 | G7 | Cmaj7 | % |");
  });
  it("honours startBar, barsPerChord and repeat", async () => {
    const out = await run(base(), "apply_progression", {
      progression: "I-V-vi-IV",
      key: "C",
      startBar: 2,
      barsPerChord: 2,
      repeat: 2
    });
    const chords = chordsOf(out.state, out.state.tracks.find((t) => t.type === "chord")!.id);
    expect(chords).toHaveLength(8);
    expect(chords[0].startTick).toBe(BAR);
    expect(chords[0].durationTick).toBe(2 * BAR);
    expect(chords[7].startTick + chords[7].durationTick).toBe(17 * BAR);
  });
  it("lists the valid progressions on a bad name", async () => {
    const out = await run(base(), "apply_progression", { progression: "nope" });
    expect(out.error).toMatch(/list_progressions/);
    expect(out.error).toMatch(/I-V-vi-IV/);
  });
  it("teaches the key forms on a bad key", async () => {
    const out = await run(base(), "apply_progression", { progression: "I-V-vi-IV", key: "H major" });
    expect(out.error).toMatch(/F# major/);
  });
});

describe("transpose_chords", () => {
  const withNotes = () =>
    base({
      tracks: [...base().tracks, chordTrack([chord("a", 0, 1, 0, "maj"), chord("b", 1, 1, 5, "maj")])],
      clips: [
        midiClip("free", [[60, 0, 960], [64, BAR, 960]]),
        midiClip("follower", [[60, 0, 960]], { harmony: { style: "comp", input: "chords" } })
      ]
    });
  it("moves the chords in a bar range", async () => {
    const out = await run(withNotes(), "transpose_chords", { semitones: 2, startBar: 2 });
    expect(syms(out.state)).toEqual(["C@0+1", "G@1+1"]);
  });
  it("leaves written notes alone by default", async () => {
    const out = await run(withNotes(), "transpose_chords", { semitones: 2 });
    expect(out.state.clips.find((c) => c.id === "free")!.notes!.map((n) => n.pitch)).toEqual([60, 64]);
  });
  it("without a chord track it needs includeNotes", async () => {
    const s = base({ clips: [midiClip("free", [[60, 0, 960]])] });
    const refused = await run(s, "transpose_chords", { semitones: 2 });
    expect(refused.error).toMatch(/set_chords/);
    const moved = await run(s, "transpose_chords", { semitones: 2, includeNotes: true });
    expect(moved.state.clips[0].notes![0].pitch).toBe(62);
  });
  it("includeNotes moves notes of clips that do not follow chords, in the range", async () => {
    const out = await run(withNotes(), "transpose_chords", { semitones: 2, startBar: 2, includeNotes: true });
    expect(out.state.clips.find((c) => c.id === "free")!.notes!.map((n) => n.pitch)).toEqual([60, 66]);
    expect(out.state.clips.find((c) => c.id === "follower")!.notes!.map((n) => n.pitch)).toEqual([60]);
    expect(out.result.transposedNoteCount).toBe(1);
  });
});

describe("detect_chords", () => {
  const notes = (): Array<[number, number, number]> => [
    [57, 0, BAR], [60, 0, BAR], [64, 0, BAR],
    [53, BAR, BAR], [57, BAR, BAR], [60, BAR, BAR]
  ];
  const state = () => base({ clips: [midiClip("m", notes(), { durationMs: 4000 })] });

  it("writes the chords and returns the chart", async () => {
    const out = await run(state(), "detect_chords", { clipIds: ["m"] });
    expect(out.error).toBeUndefined();
    expect(out.result.chart).toBe("| Am | F |");
    expect(out.result.written).toBe(true);
    const track = out.state.tracks.find((t) => t.type === "chord")!;
    expect(track.chords!.map(chordSymbol)).toEqual(["Am", "F"]);
  });
  it("with write false only returns the chart and changes nothing", async () => {
    const out = await run(state(), "detect_chords", { clipIds: ["m"], write: false });
    expect(out.result.chart).toBe("| Am | F |");
    expect(out.result.written).toBe(false);
    expect(out.state.tracks.some((t) => t.type === "chord")).toBe(false);
  });
  it("reads a track and a half-bar resolution", async () => {
    const out = await run(state(), "detect_chords", { trackIds: ["keys"], resolution: "half", write: false });
    expect(out.result.chart).toBe("| Am | F |");
  });
  it("limits to a bar range", async () => {
    const out = await run(state(), "detect_chords", { clipIds: ["m"], startBar: 2, endBar: 2, write: false });
    expect(out.result.chart).toBe("| F |");
  });
  describe("audio clips", () => {
    const SR = 44100;
    const hz = (p: number) => 440 * 2 ** ((p - 69) / 12);
    // 120 bpm 4/4: one bar is 2 s. C, F, G, C.
    const progression = [[60, 64, 67], [65, 69, 72], [67, 71, 74], [60, 64, 67]];
    const audio = new Float32Array(8 * SR);
    progression.forEach((pitches, bar) => {
      for (let i = 0; i < 2 * SR; i++) {
        const t = (bar * 2 * SR + i) / SR;
        audio[bar * 2 * SR + i] = pitches.reduce((a, p) => a + Math.sin(2 * Math.PI * hz(p) * t), 0) / 6;
      }
    });
    const stem = (over: Partial<TimelineClip> = {}) =>
      makeClip({ id: "stem", trackId: "a", name: "Keys stem", startMs: 0, durationMs: 8000, mediaType: "audio", ...over });
    const withAudio = (clips: TimelineClip[], role?: "drums") =>
      base({
        tracks: [...base().tracks, makeTrack({ id: "a", type: "audio", name: "Audio", index: 1, ...(role ? { musicRole: role } : {}) })],
        clips
      });
    const ctxWith = () => {
      let n = 0;
      return {
        newId: (kind: string) => `${kind}_${++n}`,
        decodeClipAudio: async () => ({ samples: audio, sampleRate: SR })
      } as never;
    };
    const runAudio = (s: TimelineOpState, args: Record<string, unknown>) =>
      applyTimelineOp(s, timelineOpFromToolArgs("detect_chords", args), ctxWith());

    it("reads a C F G C progression from an audio clip and writes it", async () => {
      const out = await runAudio(withAudio([stem()]), { clipIds: ["stem"] });
      expect(out.error).toBeUndefined();
      expect(out.result.chart).toBe("| C | F | G | C |");
      expect(syms(out.state)).toEqual(["C@0+1", "F@1+1", "G@2+1", "C@3+1"]);
    });
    it("follows the in-point of a trimmed clip", async () => {
      const out = await runAudio(withAudio([stem({ startMs: 0, durationMs: 4000, inPointMs: 2000 })]), {
        clipIds: ["stem"],
        write: false
      });
      expect(out.result.chart).toBe("| F | G |");
    });
    it("reads an audio track and skips a drum track", async () => {
      const ok = await runAudio(withAudio([stem()]), { trackIds: ["a"], write: false });
      expect(ok.result.chart).toBe("| C | F | G | C |");
      const drums = await runAudio(withAudio([stem()], "drums"), { trackIds: ["a"], write: false });
      expect(drums.error).toMatch(/No midi or audio clips/);
    });
    it("refuses midi and audio together", async () => {
      const s = withAudio([stem(), midiClip("m", [[60, 0, BAR]])]);
      const out = await runAudio(s, { clipIds: ["stem", "m"] });
      expect(out.error).toMatch(/separate calls/);
    });
    it("says so when the host cannot decode audio", async () => {
      const out = await run(withAudio([stem()]), "detect_chords", { clipIds: ["stem"] });
      expect(out.error).toMatch(/cannot decode audio/);
    });

    // Source slice decoder that honours the requested range, like a real host.
    const rangedCtx = (calls: Array<{ clipId: string; range?: { startMs: number; endMs: number } }>) => {
      let n = 0;
      return {
        newId: (kind: string) => `${kind}_${++n}`,
        decodeClipAudio: async (clip: TimelineClip, range?: { startMs: number; endMs: number }) => {
          calls.push({ clipId: clip.id, range });
          if (!range) return { samples: audio, sampleRate: SR };
          const from = Math.floor((range.startMs * SR) / 1000);
          const to = Math.ceil((range.endMs * SR) / 1000);
          return { samples: audio.slice(from, to), sampleRate: SR, startMs: (from * 1000) / SR };
        }
      } as never;
    };
    it("decodes only the source span the range needs and shares one decode per asset", async () => {
      const calls: Array<{ clipId: string; range?: { startMs: number; endMs: number } }> = [];
      const left = stem({ id: "l", durationMs: 4000, currentAssetId: "wav" });
      const right = stem({ id: "r", startMs: 4000, durationMs: 4000, inPointMs: 4000, currentAssetId: "wav" });
      const out = await applyTimelineOp(
        withAudio([left, right]),
        timelineOpFromToolArgs("detect_chords", { trackIds: ["a"], startBar: 2, endBar: 3, write: false }),
        rangedCtx(calls)
      );
      expect(out.result.chart).toBe("| F | G |");
      expect(calls).toHaveLength(1);
      expect(calls[0].range!.startMs).toBeGreaterThanOrEqual(1900);
      expect(calls[0].range!.endMs).toBeLessThanOrEqual(6100);
    });
    it("keeps chord ticks at 0 or more when the clip starts before the tempo offset", async () => {
      const s = withAudio([stem({ startMs: 0, durationMs: 8000 })]);
      s.tempo = { ...DEFAULT_TEMPO, offsetMs: 2000 };
      const out = await runAudio(s, { clipIds: ["stem"] });
      expect(out.error).toBeUndefined();
      const starts = (out.state.tracks.find((t) => t.type === "chord")!.chords ?? []).map((c) => c.startTick);
      expect(Math.min(...starts)).toBeGreaterThanOrEqual(0);
      expect(out.result.range.startBar).toBeGreaterThanOrEqual(1);
    });
    it("reads a slowed clip whose source slice per window is under 50 ms", async () => {
      // One beat at 120 bpm is 500 ms. At 0.09x it plays 45 ms of source.
      const out = await runAudio(withAudio([stem({ durationMs: 8000, speedMultiplier: 0.09 })]), {
        clipIds: ["stem"],
        resolution: "beat",
        startBar: 1,
        endBar: 1,
        write: false
      });
      expect(out.result.chordCount).toBeGreaterThan(0);
    });
    it("reads the forward stretches of a boomerang remap and skips a reverse clip", async () => {
      const boomerang = stem({
        durationMs: 2000,
        timeRemap: { keyframes: [{ t: 0, sourceMs: 0 }, { t: 0.5, sourceMs: 1000 }, { t: 1, sourceMs: 0 }] }
      });
      const heard = await runAudio(withAudio([boomerang]), { clipIds: ["stem"], startBar: 1, endBar: 1, write: false });
      expect(heard.result.chart).toBe("| C |");
      const reversed = stem({
        durationMs: 2000,
        timeRemap: { keyframes: [{ t: 0, sourceMs: 2000 }, { t: 1, sourceMs: 0 }] }
      });
      const silent = await runAudio(withAudio([reversed]), { clipIds: ["stem"], startBar: 1, endBar: 1, write: false });
      expect(silent.result.chordCount).toBe(0);
      expect(silent.result.message).toMatch(/No sound/);
    });
    it("skips a muted audio track and a midi drum track in a track list", async () => {
      const muted = withAudio([stem()]);
      muted.tracks = muted.tracks.map((t) => (t.id === "a" ? { ...t, muted: true } : t));
      expect((await runAudio(muted, { trackIds: ["a"], write: false })).error).toMatch(/No midi or audio clips/);
      const mixed = withAudio([stem(), midiClip("drum", [[36, 0, 480]], { trackId: "kit" })]);
      mixed.tracks.push(makeTrack({ id: "kit", type: "midi", name: "Kit", index: 2, musicRole: "drums" }));
      const out = await runAudio(mixed, { trackIds: ["a", "kit"], write: false });
      expect(out.error).toBeUndefined();
      expect(out.result.chart).toBe("| C | F | G | C |");
    });
    it("takes the bass from the bass clip, not the first clip", async () => {
      const mk = (build: (t: number) => number) => {
        const a = new Float32Array(2 * SR);
        for (let i = 0; i < a.length; i++) a[i] = build(i / SR);
        return a;
      };
      const piano = mk((t) => [60, 64, 67].reduce((v, p) => v + Math.sin(2 * Math.PI * hz(p) * t), 0) / 6);
      const bass = mk((t) => 0.5 * Math.sin(2 * Math.PI * hz(40) * t));
      const sources: Record<string, Float32Array> = { piano, bass };
      let n = 0;
      const out = await applyTimelineOp(
        withAudio([
          stem({ id: "piano", durationMs: 2000, currentAssetId: "piano" }),
          stem({ id: "bass", durationMs: 2000, currentAssetId: "bass" })
        ]),
        timelineOpFromToolArgs("detect_chords", { clipIds: ["piano", "bass"], write: false }),
        {
          newId: (kind: string) => `${kind}_${++n}`,
          decodeClipAudio: async (clip: TimelineClip) => ({ samples: sources[clip.currentAssetId!], sampleRate: SR })
        } as never
      );
      expect(out.result.chart).toBe("| C/E |");
    });
    it("reports a clip whose audio cannot be read", async () => {
      const out = await applyTimelineOp(
        withAudio([stem()]),
        timelineOpFromToolArgs("detect_chords", { clipIds: ["stem"] }),
        { newId: () => "x", decodeClipAudio: async () => null } as never
      );
      expect(out.error).toMatch(/Could not read the audio of clip "Keys stem"/);
    });
  });
  it("names the two source arguments when none is given", async () => {
    const out = await run(state(), "detect_chords", {});
    expect(out.error).toMatch(/clipIds/);
    expect(out.error).toMatch(/trackIds/);
  });
});

describe("set_clip_harmony", () => {
  const state = () => base({ clips: [midiClip("m", [[60, 0, 960]])] });
  it("sets a comp preset and merges later fields", async () => {
    const name = COMP_LIBRARY[0].name;
    const first = await run(state(), "set_clip_harmony", { clipId: "m", preset: name });
    expect(first.error).toBeUndefined();
    const h1 = first.state.clips[0].harmony!;
    expect(h1.style).toBe("comp");
    expect(h1.input).toBe("chords");
    expect(h1.comp).toEqual(COMP_LIBRARY[0].comp);
    const second = await run(first.state, "set_clip_harmony", { clipId: "m", scale: "chords", octave: 4 });
    const h2 = second.state.clips[0].harmony!;
    expect(h2.style).toBe("comp");
    expect(h2.comp).toEqual(COMP_LIBRARY[0].comp);
    expect(h2.scale).toBe("chords");
    expect(h2.octave).toBe(4);
    expect(second.result.harmony).toContain("scale: chords");
  });
  it("sets an arp style", async () => {
    const out = await run(state(), "set_clip_harmony", { clipId: "m", style: "arp" });
    expect(out.state.clips[0].harmony).toMatchObject({ style: "arp", input: "chords" });
  });
  it("turns the harmony off", async () => {
    const on = await run(state(), "set_clip_harmony", { clipId: "m", style: "arp" });
    const off = await run(on.state, "set_clip_harmony", { clipId: "m", style: "off", scale: "off" });
    expect(off.state.clips[0].harmony).toMatchObject({ style: "off", scale: "off" });
  });
  it("points at list_harmony_presets for an unknown preset", async () => {
    const out = await run(state(), "set_clip_harmony", { clipId: "m", preset: "zzz" });
    expect(out.error).toMatch(/list_harmony_presets/);
    expect(out.error).toContain(COMP_LIBRARY[0].name);
  });
  it("rejects a bad style with the valid values", () => {
    expect(() => timelineOpFromToolArgs("set_clip_harmony", { clipId: "m", style: "strum" })).toThrow(/arp/);
  });
  it("refuses a chord track id that is not a chord track", async () => {
    const out = await run(state(), "set_clip_harmony", { clipId: "m", style: "arp", chordTrackId: "keys" });
    expect(out.error).toMatch(/chord track/);
  });
  it("makes expandClipHarmony play the chords", async () => {
    const s = base({
      tracks: [...base().tracks, chordTrack([chord("a", 0, 4, 0, "maj")])],
      clips: [midiClip("m", [])]
    });
    const out = await run(s, "set_clip_harmony", { clipId: "m", style: "arp" });
    const notes = expandClipHarmony(out.state.clips[0], out.state);
    expect(notes.length).toBeGreaterThan(0);
  });
});

describe("list_harmony_presets", () => {
  it("lists comp presets and arp orders", async () => {
    const out = await run(base(), "list_harmony_presets", {});
    const families = out.result.compPresets as Array<{ family: string; names: string[] }>;
    expect(families.flatMap((f) => f.names)).toHaveLength(COMP_LIBRARY.length);
    expect(out.result.arpOrders).toEqual(["up", "down", "updown", "played", "random"]);
  });
});

describe("fit_notes_to_chords", () => {
  const chords = [chord("a", 0, 1, 0, "maj"), chord("b", 2, 1, 7, "maj")];
  const state = () =>
    base({
      tempo: { ...DEFAULT_TEMPO, key: { tonic: "G", mode: "major" } },
      tracks: [...base().tracks, chordTrack(chords)],
      clips: [
        midiClip("m", [
          [61, 0, 960], // C# in C major: outside C major scale, moves to C (ties go down)
          [62, BAR, 960], // bar 2: no chord, stays
          [66, 2 * BAR, 960] // F# in G major: in scale, stays
        ])
      ]
    });
  it("scale mode moves notes into the scale of the chord at their start", async () => {
    const out = await run(state(), "fit_notes_to_chords", { clipIds: ["m"] });
    expect(out.error).toBeUndefined();
    expect(out.state.clips[0].notes!.map((n) => n.pitch)).toEqual([60, 62, 66]);
    expect(out.result.movedNoteCount).toBe(1);
  });
  it("chord-tones mode moves notes to chord tones", async () => {
    const out = await run(state(), "fit_notes_to_chords", { clipIds: ["m"], mode: "chord-tones" });
    // 61 -> 60 (C), 62 untouched (no chord), 66 -> 67? F# between D (62 not tone)... G major tones G B D: 66 is F#, nearest tone G (67) up 1 vs D (62)/ B(71): up.
    expect(out.state.clips[0].notes!.map((n) => n.pitch)).toEqual([60, 62, 67]);
    expect(out.result.movedNoteCount).toBe(2);
  });
  it("keeps note ids and timing", async () => {
    const out = await run(state(), "fit_notes_to_chords", { clipIds: ["m"] });
    expect(out.state.clips[0].notes!.map((n) => n.id)).toEqual(["m_n0", "m_n1", "m_n2"]);
    expect(out.state.clips[0].notes!.map((n) => n.startTick)).toEqual([0, BAR, 2 * BAR]);
  });
  it("moves nothing and points at set_chords when there are no chords", async () => {
    const s = base({ clips: [midiClip("m", [[60, 0, 960]])] });
    const out = await run(s, "fit_notes_to_chords", { clipIds: ["m"] });
    expect(out.error).toBeUndefined();
    expect(out.result.movedNoteCount).toBe(0);
    expect(out.result.note).toMatch(/set_chords/);
  });
  it("rejects a bad mode with the valid values", () => {
    expect(() => timelineOpFromToolArgs("fit_notes_to_chords", { clipIds: ["m"], mode: "nearest" })).toThrow(/chord-tones/);
  });
});

describe("get_state", () => {
  it("shows the chord chart, key and signature, and clip harmony", async () => {
    const s = base({
      tempo: { ...DEFAULT_TEMPO, key: { tonic: "A", mode: "minor" } },
      tracks: [...base().tracks, chordTrack([chord("a", 0, 1, 9, "min"), chord("b", 1, 1, 5, "maj")])],
      clips: [midiClip("m", [[60, 0, 960]], { harmony: { style: "arp", input: "chords", scale: "chords" } })]
    });
    const out = await run(s, "get_state", {});
    const tracks = out.result.tracks as Array<Record<string, unknown>>;
    const ct = tracks.find((t) => t.type === "chord")!;
    expect(ct.chordChart).toBe("| Am | F |");
    expect(ct.key).toBe("A minor");
    expect(ct.signature).toBe("4/4");
    expect(out.result.key).toBe("A minor");
    const clips = out.result.clips as Array<Record<string, unknown>>;
    expect(clips[0].harmony).toBe("arp: up, scale: chords");
  });
});
