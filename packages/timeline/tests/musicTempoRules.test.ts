import { describe, expect, it } from "vitest";
import {
  MUSIC_TEMPO_BPM_MESSAGE,
  MUSIC_TEMPO_SIGNATURE_MESSAGE,
  TEMPO_LOCKED_MESSAGE,
  isTempoLocked,
  musicTempoRefusal,
  tempoChangeRefusal,
  type TempoRuleSequence
} from "../src/music/tempoRules.js";
import type { TimelineTempo } from "../src/types.js";

const tempo = (bpm: number, beatsPerBar = 4, beatUnit = 4, offsetMs = 0): TimelineTempo => ({
  bpm,
  offsetMs,
  timeSignature: { beatsPerBar, beatUnit }
});

describe("MD9 music tempo", () => {
  it("accepts whole-number tempi from 30 to 300 in the four signatures", () => {
    for (const bpm of [30, 87, 120, 300]) {
      for (const [b, u] of [[2, 4], [3, 4], [4, 4], [6, 8]]) {
        expect(musicTempoRefusal(tempo(bpm, b, u))).toBeNull();
      }
    }
  });

  it("refuses fractional or out-of-range tempi and other signatures", () => {
    for (const bpm of [29, 301, 87.5, 0, Number.NaN]) {
      expect(musicTempoRefusal(tempo(bpm))).toBe(MUSIC_TEMPO_BPM_MESSAGE);
    }
    for (const [b, u] of [[5, 4], [6, 4], [3, 8], [4, 2], [12, 8], [7, 8]]) {
      expect(musicTempoRefusal(tempo(120, b, u))).toBe(MUSIC_TEMPO_SIGNATURE_MESSAGE);
    }
  });
});

describe("MD6 tempo lock", () => {
  const audio = { mediaType: "audio" as const };
  const video = { mediaType: "video" as const };

  it("locks a sequence that holds an audio clip", () => {
    expect(isTempoLocked({ clips: [] })).toBe(false);
    expect(isTempoLocked({ clips: [video] })).toBe(false);
    expect(isTempoLocked({ clips: [video, audio] })).toBe(true);
  });

  it("refuses a timing change on a locked sequence and names the reason", () => {
    const locked: TempoRuleSequence = { tempo: tempo(120), clips: [audio] };
    expect(TEMPO_LOCKED_MESSAGE).toContain("audio clip");
    expect(tempoChangeRefusal(locked, tempo(121))).toBe(TEMPO_LOCKED_MESSAGE);
    expect(tempoChangeRefusal(locked, tempo(120, 3, 4))).toBe(TEMPO_LOCKED_MESSAGE);
    expect(tempoChangeRefusal(locked, tempo(120, 6, 8))).toBe(TEMPO_LOCKED_MESSAGE);
    expect(tempoChangeRefusal(locked, tempo(120, 4, 4, 10))).toBe(TEMPO_LOCKED_MESSAGE);
    // A key change keeps the timing, so it is allowed.
    expect(tempoChangeRefusal(locked, { ...tempo(120), key: { tonic: "A", mode: "minor" } })).toBeNull();
    // A document without tempo reads at 120 BPM, 4/4.
    expect(tempoChangeRefusal({ clips: [audio] }, tempo(120))).toBeNull();
    expect(tempoChangeRefusal({ clips: [audio] }, tempo(90))).toBe(TEMPO_LOCKED_MESSAGE);
  });

  it("accepts a timing change on a sequence with no audio clip", () => {
    expect(tempoChangeRefusal({ tempo: tempo(120), clips: [video] }, tempo(87.5, 7, 8))).toBeNull();
  });

  it("applies MD9 to a sequence with the music object", () => {
    const music: TempoRuleSequence = { tempo: tempo(120), music: {}, clips: [] };
    expect(tempoChangeRefusal(music, tempo(87))).toBeNull();
    expect(tempoChangeRefusal(music, tempo(87.5))).toBe(MUSIC_TEMPO_BPM_MESSAGE);
    expect(tempoChangeRefusal(music, tempo(120, 5, 4))).toBe(MUSIC_TEMPO_SIGNATURE_MESSAGE);
    expect(tempoChangeRefusal({ ...music, clips: [audio] }, tempo(87.5))).toBe(TEMPO_LOCKED_MESSAGE);
  });
});
