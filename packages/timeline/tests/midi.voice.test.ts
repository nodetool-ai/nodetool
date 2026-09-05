import { describe, expect, it } from "vitest";
import { DEFAULT_MIDI_INSTRUMENT } from "../src/midi/instrument.js";
import { MIDI_PPQ } from "../src/midi/ticks.js";
import {
  MIDI_END_RAMP_MS,
  naiveSaw,
  pitchToHz,
  polyBlepSaw,
  polyBlepSquare,
  renderAuditionNote,
  renderMidiClip,
  sineWave,
  softLimit,
  triangleWave,
  createEnvelope,
  stepEnvelope,
  lowpassCoeffs,
  createBiquadState,
  stepBiquad
} from "../src/midi/voice.js";
import type { MidiNote } from "../src/types.js";

const SR = 48000;
const BPM = 120; // one quarter note = 500ms, so one tick = 500/960 ms.

const note = (over: Partial<MidiNote>): MidiNote => ({
  id: "n1",
  pitch: 60,
  velocity: 100,
  startTick: 0,
  durationTick: MIDI_PPQ,
  ...over
});

const maxAbs = (buf: Float32Array, from = 0, to = buf.length) => {
  let max = 0;
  for (let i = from; i < to; i++) max = Math.max(max, Math.abs(buf[i]));
  return max;
};

describe("oscillators", () => {
  it("stays in range and hits the shapes' known points", () => {
    expect(triangleWave(0)).toBeCloseTo(-1, 12);
    expect(triangleWave(0.5)).toBeCloseTo(1, 12);
    expect(sineWave(0.25)).toBeCloseTo(1, 12);
    expect(naiveSaw(0)).toBe(-1);
    expect(naiveSaw(1)).toBe(1);
  });

  it("softens the saw's discontinuity relative to the naive one", () => {
    const dt = 400 / SR;
    const jump = (fn: (phase: number, dt: number) => number) => {
      let phase = 0;
      let previous = fn(phase, dt);
      let max = 0;
      for (let i = 0; i < 2000; i++) {
        phase += dt;
        if (phase >= 1) phase -= 1;
        const value = fn(phase, dt);
        max = Math.max(max, Math.abs(value - previous));
        previous = value;
      }
      return max;
    };
    const naive = jump((phase) => naiveSaw(phase));
    const banded = jump(polyBlepSaw);
    expect(banded).toBeLessThan(naive);
    // The correction removes about half the step, not a rounding error's worth.
    expect(banded).toBeLessThan(naive * 0.75);
  });

  it("softens the square's discontinuity too", () => {
    const dt = 400 / SR;
    let phase = 0;
    let previous = polyBlepSquare(phase, dt);
    let max = 0;
    for (let i = 0; i < 2000; i++) {
      phase += dt;
      if (phase >= 1) phase -= 1;
      const value = polyBlepSquare(phase, dt);
      max = Math.max(max, Math.abs(value - previous));
      previous = value;
    }
    expect(max).toBeLessThan(2);
  });
});

describe("pitchToHz", () => {
  it("puts A4 at 440 and middle C near 261.6", () => {
    expect(pitchToHz(69)).toBeCloseTo(440, 9);
    expect(pitchToHz(60)).toBeCloseTo(261.6255653, 6);
    expect(pitchToHz(81)).toBeCloseTo(880, 9);
  });
});

describe("envelope", () => {
  it("rises over the attack, falls to sustain, and releases to zero", () => {
    const state = createEnvelope(
      {
        ...DEFAULT_MIDI_INSTRUMENT,
        attackMs: 10,
        decayMs: 10,
        sustain: 0.5,
        releaseMs: 10
      },
      1000 // 1 kHz: 10ms is 10 samples, so the stages are countable.
    );
    const attack: number[] = [];
    for (let i = 0; i < 10; i++) attack.push(stepEnvelope(state, true));
    expect(attack[0]).toBeCloseTo(0.1, 9);
    expect(attack[9]).toBeCloseTo(1, 9);
    for (let i = 0; i < 10; i++) stepEnvelope(state, true);
    expect(state.stage).toBe("sustain");
    expect(state.level).toBeCloseTo(0.5, 9);
    for (let i = 0; i < 20; i++) stepEnvelope(state, false);
    expect(state.stage).toBe("done");
    expect(state.level).toBe(0);
  });

  it("survives a zero-length release without going NaN", () => {
    const state = createEnvelope(
      { ...DEFAULT_MIDI_INSTRUMENT, releaseMs: 0 },
      SR
    );
    expect(stepEnvelope(state, false)).toBe(0);
    expect(Number.isNaN(state.level)).toBe(false);
  });
});

describe("biquad", () => {
  it("passes DC and rejects Nyquist", () => {
    const coeffs = lowpassCoeffs(SR, 4000, 0.7);
    const dc = createBiquadState();
    let out = 0;
    for (let i = 0; i < 2000; i++) out = stepBiquad(coeffs, dc, 1);
    expect(out).toBeCloseTo(1, 4);

    const alternating = createBiquadState();
    let peak = 0;
    for (let i = 0; i < 2000; i++) {
      peak = Math.abs(stepBiquad(coeffs, alternating, i % 2 === 0 ? 1 : -1));
    }
    expect(peak).toBeLessThan(0.05);
  });
});

describe("softLimit", () => {
  it("keeps everything inside [-1, 1] without inverting it", () => {
    expect(softLimit(0)).toBe(0);
    expect(softLimit(20)).toBeLessThanOrEqual(1);
    expect(softLimit(-20)).toBeGreaterThanOrEqual(-1);
    expect(softLimit(2)).toBeLessThan(1);
    expect(softLimit(0.5)).toBeGreaterThan(softLimit(0.2));
  });
});

describe("renderMidiClip", () => {
  it("returns exactly round(durationMs / 1000 * sampleRate) frames", () => {
    for (const durationMs of [1000, 1500, 333, 1]) {
      const buffer = renderMidiClip({
        clip: { notes: [note({})], durationMs },
        bpm: BPM,
        instrument: DEFAULT_MIDI_INSTRUMENT,
        sampleRate: SR
      });
      expect(buffer.length).toBe(Math.round((durationMs / 1000) * SR));
      expect(buffer).toBeInstanceOf(Float32Array);
    }
  });

  it("is silent before the first onset and sounding just after it", () => {
    // The note starts one quarter note in: 500ms, frame 24000.
    const buffer = renderMidiClip({
      clip: { notes: [note({ startTick: MIDI_PPQ })], durationMs: 2000 },
      bpm: BPM,
      instrument: DEFAULT_MIDI_INSTRUMENT,
      sampleRate: SR
    });
    const onset = 24000;
    expect(maxAbs(buffer, 0, onset)).toBe(0);
    expect(maxAbs(buffer, onset, onset + 64)).toBeGreaterThan(1e-5);
  });

  it("decays to silence by the window end when the note ends inside it", () => {
    // 500ms note, 150ms release, 2000ms window: long gone by the end.
    const buffer = renderMidiClip({
      clip: { notes: [note({})], durationMs: 2000 },
      bpm: BPM,
      instrument: DEFAULT_MIDI_INSTRUMENT,
      sampleRate: SR
    });
    expect(maxAbs(buffer, buffer.length - 1000)).toBeLessThan(1e-6);
    expect(maxAbs(buffer)).toBeGreaterThan(0.01);
  });

  it("does not trigger a note that started before the in-point", () => {
    const buffer = renderMidiClip({
      clip: {
        notes: [note({ startTick: 0, durationTick: MIDI_PPQ * 8 })],
        inPointMs: 1000,
        durationMs: 1000
      },
      bpm: BPM,
      instrument: DEFAULT_MIDI_INSTRUMENT,
      sampleRate: SR
    });
    expect(maxAbs(buffer)).toBe(0);
  });

  it("gates a note crossing the window end and ramps the tail to zero", () => {
    // A four-beat note in a one-beat window: still sounding when the buffer ends.
    const buffer = renderMidiClip({
      clip: {
        notes: [note({ startTick: 0, durationTick: MIDI_PPQ * 4 })],
        durationMs: 500
      },
      bpm: BPM,
      instrument: DEFAULT_MIDI_INSTRUMENT,
      sampleRate: SR
    });
    const rampFrames = Math.round((MIDI_END_RAMP_MS / 1000) * SR);
    expect(buffer[buffer.length - 1]).toBe(0);
    // Loud right up to where the ramp begins, then faded out over it.
    expect(
      maxAbs(
        buffer,
        buffer.length - rampFrames - 64,
        buffer.length - rampFrames
      )
    ).toBeGreaterThan(0.01);
    expect(
      maxAbs(buffer, buffer.length - Math.floor(rampFrames / 4))
    ).toBeLessThan(
      maxAbs(
        buffer,
        buffer.length - rampFrames,
        buffer.length - rampFrames + 64
      )
    );
  });

  it("renders the same input to the same samples", () => {
    const input = {
      clip: {
        notes: [note({}), note({ id: "n2", pitch: 67, startTick: 240 })],
        durationMs: 1000
      },
      bpm: BPM,
      instrument: DEFAULT_MIDI_INSTRUMENT,
      sampleRate: SR
    };
    const a = renderMidiClip(input);
    const b = renderMidiClip(input);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("keeps eight notes at velocity 127 inside [-1, 1]", () => {
    const chord = [60, 64, 67, 71, 74, 77, 81, 84].map((pitch, i) =>
      note({
        id: `n${i}`,
        pitch,
        velocity: 127,
        durationTick: MIDI_PPQ * 2
      })
    );
    const buffer = renderMidiClip({
      clip: { notes: chord, durationMs: 1000 },
      bpm: BPM,
      instrument: DEFAULT_MIDI_INSTRUMENT,
      sampleRate: SR
    });
    for (const sample of buffer) {
      expect(sample).toBeGreaterThanOrEqual(-1);
      expect(sample).toBeLessThanOrEqual(1);
    }
    expect(maxAbs(buffer)).toBeGreaterThan(0.1);
  });

  it("scales amplitude with velocity", () => {
    const render = (velocity: number) =>
      maxAbs(
        renderMidiClip({
          clip: { notes: [note({ velocity })], durationMs: 1000 },
          bpm: BPM,
          instrument: DEFAULT_MIDI_INSTRUMENT,
          sampleRate: SR
        })
      );
    expect(render(30)).toBeLessThan(render(127));
  });

  it("renders silence for a clip with no notes", () => {
    const buffer = renderMidiClip({
      clip: { durationMs: 500 },
      bpm: BPM,
      instrument: DEFAULT_MIDI_INSTRUMENT,
      sampleRate: SR
    });
    expect(buffer.length).toBe(24000);
    expect(maxAbs(buffer)).toBe(0);
  });
});

describe("renderAuditionNote", () => {
  it("runs the release past the held length and sounds", () => {
    const buffer = renderAuditionNote({
      pitch: 60,
      velocity: 100,
      durationMs: 300,
      instrument: DEFAULT_MIDI_INSTRUMENT,
      sampleRate: SR
    });
    expect(buffer.length).toBe(
      Math.round(((300 + DEFAULT_MIDI_INSTRUMENT.releaseMs) / 1000) * SR)
    );
    const peak = maxAbs(buffer);
    expect(peak).toBeGreaterThan(0.01);
    // The envelope is closed by the end; what is left is the filter ringing
    // out, an order of magnitude below the note itself.
    expect(maxAbs(buffer, buffer.length - 100)).toBeLessThan(peak * 0.1);
  });
});
