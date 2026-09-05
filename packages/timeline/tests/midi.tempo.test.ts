import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEMPO,
  rescaleClipsForTempo,
  resolveTempo
} from "../src/midi/tempo.js";
import type { TimelineClip, TimelineTrack } from "../src/types.js";

function makeClip(overrides: Partial<TimelineClip>): TimelineClip {
  return {
    id: "clip-1",
    trackId: "midi-track",
    name: "Phrase",
    startMs: 0,
    durationMs: 2000,
    mediaType: "midi",
    sourceType: "generated",
    status: "generated",
    locked: false,
    versions: [],
    ...overrides
  };
}

const tracks: TimelineTrack[] = [
  {
    id: "midi-track",
    name: "Keys",
    type: "midi",
    index: 0,
    visible: true,
    locked: false
  },
  {
    id: "audio-track",
    name: "VO",
    type: "audio",
    index: 1,
    visible: true,
    locked: false
  }
];

describe("resolveTempo", () => {
  it("falls back to 120 BPM in 4/4", () => {
    expect(resolveTempo({})).toEqual(DEFAULT_TEMPO);
    expect(resolveTempo({ tempo: DEFAULT_TEMPO })).toBe(DEFAULT_TEMPO);
    const own = { ...DEFAULT_TEMPO, bpm: 90 };
    expect(resolveTempo({ tempo: own })).toBe(own);
  });
});

describe("rescaleClipsForTempo", () => {
  const from120to60 = (clips: TimelineClip[]) =>
    rescaleClipsForTempo(clips, tracks, DEFAULT_TEMPO, {
      ...DEFAULT_TEMPO,
      bpm: 60
    });

  it("doubles a midi clip's start and duration when the tempo halves", () => {
    const [scaled] = from120to60([
      makeClip({ startMs: 1000, durationMs: 2000 })
    ]);
    expect(scaled.startMs).toBe(2000);
    expect(scaled.durationMs).toBe(4000);
  });

  it("scales the window over the notes too", () => {
    const [scaled] = from120to60([
      makeClip({
        startMs: 0,
        durationMs: 1000,
        inPointMs: 500,
        outPointMs: 1500
      })
    ]);
    expect(scaled.inPointMs).toBe(1000);
    expect(scaled.outPointMs).toBe(3000);
  });

  it("scales around the tempo offset, not around zero", () => {
    const [scaled] = rescaleClipsForTempo(
      [makeClip({ startMs: 1500, durationMs: 1000 })],
      tracks,
      { ...DEFAULT_TEMPO, offsetMs: 1000 },
      { ...DEFAULT_TEMPO, bpm: 60, offsetMs: 1000 }
    );
    expect(scaled.startMs).toBe(2000);
    expect(scaled.durationMs).toBe(2000);
  });

  it("leaves an audio clip untouched, by reference", () => {
    const audio = makeClip({
      id: "clip-2",
      trackId: "audio-track",
      mediaType: "audio",
      startMs: 1000,
      durationMs: 2000
    });
    const [scaled] = from120to60([audio]);
    expect(scaled).toBe(audio);
  });

  it("rescales a clip sitting on a midi track whatever its media type", () => {
    const [scaled] = from120to60([
      makeClip({ mediaType: "audio", startMs: 1000, durationMs: 2000 })
    ]);
    expect(scaled.startMs).toBe(2000);
  });

  it("is its own inverse when the tempo goes back", () => {
    const original = makeClip({
      startMs: 750,
      durationMs: 1250,
      inPointMs: 500
    });
    const faster = { ...DEFAULT_TEMPO, bpm: 180 };
    const [there] = rescaleClipsForTempo(
      [original],
      tracks,
      DEFAULT_TEMPO,
      faster
    );
    const [back] = rescaleClipsForTempo([there], tracks, faster, DEFAULT_TEMPO);
    expect(back.startMs).toBeCloseTo(original.startMs, 9);
    expect(back.durationMs).toBeCloseTo(original.durationMs, 9);
    expect(back.inPointMs).toBeCloseTo(500, 9);
  });
});
