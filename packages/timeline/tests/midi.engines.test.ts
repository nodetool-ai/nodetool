/**
 * The FableSynth instruments: WT-1, BL-1 and DR-1.
 *
 * The interesting claims are the ones a listener would make — a wavetable note
 * does not alias, a bassline is monophonic and slides, a drum pad answers to
 * one note and no other — so the assertions measure the rendered samples rather
 * than the parameters that went in.
 */

import { describe, expect, it } from "vitest";
import {
  fft,
  getWavetable,
  TABLE_FRAMES,
  TABLE_MIPS,
  TABLE_SIZE
} from "../src/midi/engines/wavetables.js";
import { renderAuditionNote, renderInstrumentEvents } from "../src/midi/voice.js";
import { findInstrumentPreset } from "../src/midi/presets.js";
import { instrumentSignature, instrumentTailMs } from "../src/midi/instrument.js";
import { midiRenderKey } from "../src/midi/cacheKey.js";
import type {
  BassMidiInstrument,
  DrumMidiInstrument,
  MidiInstrument,
  WavetableMidiInstrument
} from "../src/types.js";

const SAMPLE_RATE = 48000;
/** Frames the spectrum tests analyze. */
const ANALYSIS_SIZE = 8192;

const preset = (id: string): MidiInstrument => {
  const found = findInstrumentPreset(id);
  if (!found) throw new Error(`missing preset ${id}`);
  return found.instrument;
};

const wt1 = preset("wt1-prime-lead") as WavetableMidiInstrument;
const bl1 = preset("bl1-acid") as BassMidiInstrument;
const dr1 = preset("dr1-tr-void") as DrumMidiInstrument;

const ms = (value: number) => Math.round((value / 1000) * SAMPLE_RATE);

const note = (
  pitch: number,
  velocity: number,
  startMs: number,
  lengthMs: number
) => ({
  pitch,
  velocity,
  startFrame: ms(startMs),
  gateOffFrame: ms(startMs + lengthMs)
});

const peak = (buffer: Float32Array, from = 0, to = buffer.length): number => {
  let highest = 0;
  for (let i = from; i < Math.min(to, buffer.length); i++) {
    highest = Math.max(highest, Math.abs(buffer[i]));
  }
  return highest;
};

/**
 * How bright a buffer is: the size of its sample-to-sample change against its
 * own level. A crude derivative, but enough to say which of two renders let
 * more high end through.
 */
const brightness = (buffer: Float32Array, from = 0, to = buffer.length): number => {
  const level = rms(buffer, from, to);
  if (level <= 0) return 0;
  let sum = 0;
  let count = 0;
  for (let i = Math.max(1, from); i < Math.min(to, buffer.length); i++) {
    const d = buffer[i] - buffer[i - 1];
    sum += d * d;
    count++;
  }
  return count > 0 ? Math.sqrt(sum / count) / level : 0;
};

const rms = (buffer: Float32Array, from = 0, to = buffer.length): number => {
  let sum = 0;
  let count = 0;
  for (let i = from; i < Math.min(to, buffer.length); i++) {
    sum += buffer[i] * buffer[i];
    count++;
  }
  return count > 0 ? Math.sqrt(sum / count) : 0;
};

/**
 * The loudest content that is not within four bins of a harmonic of
 * `fundamental`, in dB below the loudest partial.
 *
 * The window is a 4-term Blackman-Harris: its sidelobes are 90 dB down, so what
 * this reads is the signal's own foldover rather than the analysis leakage a
 * Hann window would leave 31 dB down.
 */
const worstOffHarmonicDb = (
  buffer: Float32Array,
  fundamental: number
): number => {
  const size = ANALYSIS_SIZE;
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const x = (2 * Math.PI * i) / size;
    const w =
      0.35875 -
      0.48829 * Math.cos(x) +
      0.14128 * Math.cos(2 * x) -
      0.01168 * Math.cos(3 * x);
    re[i] = (buffer[i] ?? 0) * w;
  }
  fft(re, im, false);

  const binHz = SAMPLE_RATE / size;
  let loudest = 0;
  let worst = 0;
  for (let k = 1; k < size / 2; k++) {
    const magnitude = Math.hypot(re[k], im[k]);
    loudest = Math.max(loudest, magnitude);
    const hz = k * binHz;
    const harmonic = Math.round(hz / fundamental);
    if (harmonic >= 1 && Math.abs(hz - harmonic * fundamental) <= 4 * binHz) {
      continue;
    }
    worst = Math.max(worst, magnitude);
  }
  return loudest > 0 ? 20 * Math.log10(worst / loudest) : 0;
};

describe("wavetables", () => {
  it("builds a table once and normalizes every mip to the same peak", () => {
    const table = getWavetable("prime");
    expect(getWavetable("prime")).toBe(table);
    expect(table.data.length).toBe(TABLE_FRAMES * TABLE_MIPS * TABLE_SIZE);
    // Frame 0 of PRIME is a sine, so its mip-0 peak is the headroom the
    // band-limiter normalizes every frame to.
    expect(peak(table.data, 0, TABLE_SIZE)).toBeCloseTo(0.92, 2);
    // Coarser mips share that frame's scale rather than being renormalized —
    // near it, and never past full scale, whatever Gibbs does to a square.
    expect(peak(table.data)).toBeLessThan(1);
  });

  it("keeps only the harmonics a mip level is allowed", () => {
    const table = getWavetable("prime");
    // Frame 8 is between saw and square: full of harmonics at mip 0, and mip 5
    // must hold nothing above harmonic 32.
    const re = new Float64Array(TABLE_SIZE);
    const im = new Float64Array(TABLE_SIZE);
    const off = (8 * TABLE_MIPS + 5) * TABLE_SIZE;
    for (let i = 0; i < TABLE_SIZE; i++) re[i] = table.data[off + i];
    fft(re, im, false);
    let aboveLimit = 0;
    for (let k = 33; k < TABLE_SIZE / 2; k++) {
      aboveLimit = Math.max(aboveLimit, Math.hypot(re[k], im[k]));
    }
    let fundamental = Math.hypot(re[1], im[1]);
    expect(fundamental).toBeGreaterThan(0);
    expect(aboveLimit / fundamental).toBeLessThan(1e-6);
  });
});

describe("WT-1", () => {
  it("renders the same samples every time", () => {
    const events = [note(60, 100, 0, 400)];
    const a = renderInstrumentEvents(events, ms(600), wt1, SAMPLE_RATE);
    const b = renderInstrumentEvents(events, ms(600), wt1, SAMPLE_RATE);
    expect(peak(a)).toBeGreaterThan(0.01);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("does not alias a high note", () => {
    // C7 through a saw-shaped frame: every strong partial must land on a
    // multiple of the fundamental. An aliased partial folds back to a bin that
    // is not one, which is what `worstOffHarmonicDb` measures — and the naive
    // saw below is the control that proves it can see one.
    const bright: WavetableMidiInstrument = {
      ...wt1,
      oscA: { ...wt1.oscA, position: 0.7, unison: 1, detune: 0 },
      oscB: { ...wt1.oscB, level: 0 },
      cutoffHz: 20000,
      resonance: 0,
      drive: 0,
      filterEnvAmount: 0,
      keyTrack: 0,
      ampEnv: { attackMs: 1, decayMs: 1, sustain: 1, releaseMs: 1 },
      // Quiet enough that the master soft limiter is linear: its own harmonics
      // would fold back and be read as the oscillator's aliasing.
      gainDb: -40
    };
    const fundamental = 440 * Math.pow(2, (96 - 69) / 12);
    const rendered = renderInstrumentEvents(
      [note(96, 100, 0, 400)],
      ANALYSIS_SIZE + ms(20),
      bright,
      SAMPLE_RATE
    );
    expect(
      worstOffHarmonicDb(rendered.subarray(ms(20)), fundamental)
    ).toBeLessThan(-60);

    const naive = new Float32Array(ANALYSIS_SIZE);
    let phase = 0;
    for (let i = 0; i < naive.length; i++) {
      naive[i] = 2 * phase - 1;
      phase += fundamental / SAMPLE_RATE;
      if (phase >= 1) phase -= 1;
    }
    expect(worstOffHarmonicDb(naive, fundamental)).toBeGreaterThan(-30);
  });

  it("sweeps the filter with the mod envelope", () => {
    const swept: WavetableMidiInstrument = {
      ...wt1,
      cutoffHz: 300,
      filterEnvAmount: 4,
      modEnv: { attackMs: 1, decayMs: 400, sustain: 0, releaseMs: 50 }
    };
    const closed: WavetableMidiInstrument = { ...swept, filterEnvAmount: 0 };
    const events = [note(48, 100, 0, 500)];
    const open = renderInstrumentEvents(events, ms(600), swept, SAMPLE_RATE);
    const dark = renderInstrumentEvents(events, ms(600), closed, SAMPLE_RATE);
    // While the envelope is up the filter is four octaves higher, so the note
    // is brighter; once it has decayed both are the same closed filter.
    expect(brightness(open, 0, ms(100))).toBeGreaterThan(
      brightness(dark, 0, ms(100)) * 1.5
    );
    expect(brightness(open, ms(500), ms(600))).toBeCloseTo(
      brightness(dark, ms(500), ms(600)),
      1
    );
  });
});

describe("BL-1", () => {
  it("plays one note at a time", () => {
    const upper = renderInstrumentEvents(
      [note(52, 100, 0, 400)],
      ms(500),
      bl1,
      SAMPLE_RATE
    );
    const both = renderInstrumentEvents(
      [note(40, 100, 0, 400), note(52, 100, 0, 400)],
      ms(500),
      bl1,
      SAMPLE_RATE
    );
    // Two notes on the same frame are not a chord: the later pitch takes the
    // one voice, so the pair renders as that note alone.
    expect(Array.from(both)).toEqual(Array.from(upper));
  });

  it("slides into an overlapping note instead of re-attacking", () => {
    const slow: BassMidiInstrument = {
      ...bl1,
      ampEnv: { ...bl1.ampEnv, attackMs: 120, sustain: 0.9 },
      slideMs: 40
    };
    const slid = renderInstrumentEvents(
      [note(40, 100, 0, 260), note(47, 100, 200, 300)],
      ms(600),
      slow,
      SAMPLE_RATE
    );
    const retriggered = renderInstrumentEvents(
      [note(40, 100, 0, 150), note(47, 100, 200, 300)],
      ms(600),
      slow,
      SAMPLE_RATE
    );
    // Right after the second onset the slid line is still at full level; the
    // retriggered one is climbing its attack from silence.
    const window: [number, number] = [ms(200), ms(215)];
    expect(rms(slid, ...window)).toBeGreaterThan(rms(retriggered, ...window) * 3);
  });

  it("hits harder on an accent", () => {
    const plain = renderInstrumentEvents(
      [note(40, 99, 0, 300)],
      ms(400),
      bl1,
      SAMPLE_RATE
    );
    const accented = renderInstrumentEvents(
      [note(40, 127, 0, 300)],
      ms(400),
      bl1,
      SAMPLE_RATE
    );
    expect(rms(accented, 0, ms(80))).toBeGreaterThan(rms(plain, 0, ms(80)));
  });
});

describe("DR-1", () => {
  it("answers to one note per pad and nothing outside the kit", () => {
    const kick = renderInstrumentEvents(
      [note(36, 100, 0, 20)],
      ms(600),
      dr1,
      SAMPLE_RATE
    );
    const hat = renderInstrumentEvents(
      [note(41, 100, 0, 20)],
      ms(600),
      dr1,
      SAMPLE_RATE
    );
    const offKit = renderInstrumentEvents(
      [note(72, 100, 0, 20)],
      ms(600),
      dr1,
      SAMPLE_RATE
    );
    expect(peak(kick)).toBeGreaterThan(0.05);
    expect(peak(hat)).toBeGreaterThan(0.01);
    expect(peak(offKit)).toBe(0);
    // The kick is the low pad and the closed hat the bright one: they are not
    // the same sound at a different pitch.
    expect(rms(kick, 0, ms(200))).toBeGreaterThan(rms(hat, 0, ms(200)));
  });

  it("rings for its own decay, not the note's length", () => {
    // A one-tick note still gets the kick's full 300 ms decay.
    const rendered = renderInstrumentEvents(
      [note(36, 110, 0, 5)],
      ms(600),
      dr1,
      SAMPLE_RATE
    );
    expect(peak(rendered, ms(150), ms(250))).toBeGreaterThan(0.01);
    expect(peak(rendered, ms(400), ms(600))).toBe(0);
  });

  it("scales a hit with velocity", () => {
    const soft = renderInstrumentEvents(
      [note(36, 40, 0, 20)],
      ms(400),
      dr1,
      SAMPLE_RATE
    );
    const hard = renderInstrumentEvents(
      [note(36, 127, 0, 20)],
      ms(400),
      dr1,
      SAMPLE_RATE
    );
    expect(peak(hard)).toBeGreaterThan(peak(soft) * 1.2);
  });
});

describe("instrument identity", () => {
  it("reads a nested field into the signature and the render key", () => {
    const moved: DrumMidiInstrument = {
      ...dr1,
      pads: dr1.pads.map((pad, i) =>
        i === 0 ? { ...pad, decayMs: pad.decayMs + 1 } : pad
      )
    };
    expect(instrumentSignature(moved)).not.toBe(instrumentSignature(dr1));

    const clip = {
      notes: [
        { id: "n1", pitch: 36, velocity: 100, startTick: 0, durationTick: 240 }
      ],
      durationMs: 1000
    };
    expect(midiRenderKey({ clip, bpm: 120, instrument: moved, sampleRate: 48000 })).not.toBe(
      midiRenderKey({ clip, bpm: 120, instrument: dr1, sampleRate: 48000 })
    );
  });

  it("is not confused by key order", () => {
    const reordered = { gainDb: bl1.gainDb, ...bl1 };
    expect(instrumentSignature(reordered)).toBe(instrumentSignature(bl1));
  });

  it("gives an audition room for the voice's tail", () => {
    expect(instrumentTailMs(wt1)).toBe(
      Math.max(wt1.ampEnv.releaseMs, wt1.modEnv.releaseMs)
    );
    // A drum's whole envelope plays past the gate, so its tail is the longest
    // pad rather than a release.
    expect(instrumentTailMs(dr1)).toBeGreaterThan(1000);
    const audition = renderAuditionNote({
      pitch: 47,
      velocity: 100,
      durationMs: 10,
      instrument: dr1,
      sampleRate: SAMPLE_RATE
    });
    expect(peak(audition)).toBeGreaterThan(0.01);
  });
});
