/**
 * The audio analysis math, checked against signals whose answers are known
 * without running the code: a sine's centroid is its own frequency, a square
 * wave's crest factor is 0 dB, and a -20 dBFS 1 kHz tone measures -20.0 LUFS
 * by the definition of the BS.1770 scale.
 */
import { describe, expect, it } from "vitest";
import {
  OCTAVE_BANDS,
  amplitudeToDb,
  bandEnergies,
  detectOnsets,
  energyFrames,
  estimateTempo,
  fftInPlace,
  floorPowerOfTwo,
  hannWindow,
  invertSegments,
  kWeightingFilters,
  applyBiquad,
  magnitudeSpectrum,
  measureLoudness,
  peakSummary,
  silenceSegments,
  spectralFeatures,
  spectralFlux,
  toMono,
  toPlanar
} from "../src/analysis/audio-dsp.js";

const SAMPLE_RATE = 48000;

/** A sine of `frequency` Hz at `amplitude`, `seconds` long. */
function sine(frequency: number, seconds: number, amplitude = 1): Float32Array {
  const length = Math.round(SAMPLE_RATE * seconds);
  const out = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    out[index] =
      amplitude * Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE);
  }
  return out;
}

describe("amplitudeToDb", () => {
  it("maps full scale to 0 dB and silence to the floor", () => {
    expect(amplitudeToDb(1)).toBeCloseTo(0, 6);
    expect(amplitudeToDb(0.5)).toBeCloseTo(-6.0206, 3);
    expect(amplitudeToDb(0)).toBe(-120);
  });
});

describe("toMono / toPlanar", () => {
  it("averages interleaved channels and splits them back apart", () => {
    const stereo = Float32Array.from([1, -1, 0.5, 0.5]);
    expect(Array.from(toMono(stereo, 2))).toEqual([0, 0.5]);
    const planes = toPlanar(stereo, 2);
    expect(Array.from(planes[0])).toEqual([1, 0.5]);
    expect(Array.from(planes[1])).toEqual([-1, 0.5]);
  });
});

describe("peakSummary", () => {
  it("reports a sine's peak, RMS and 3 dB crest factor", () => {
    const summary = peakSummary(sine(1000, 0.5));
    expect(summary.peak).toBeCloseTo(1, 3);
    expect(summary.rms).toBeCloseTo(Math.SQRT1_2, 3);
    expect(summary.crestFactorDb).toBeCloseTo(3.0103, 2);
    expect(summary.dcOffset).toBeCloseTo(0, 3);
  });

  it("counts clipped samples", () => {
    const clipped = Float32Array.from([0.1, 1, -1, 0.999, 0.5]);
    expect(peakSummary(clipped).clippedSamples).toBe(3);
    expect(peakSummary(Float32Array.from([0.5, -0.5])).clippedSamples).toBe(0);
  });

  it("finds a DC offset", () => {
    const offset = sine(1000, 0.2).map((value) => value * 0.5 + 0.25);
    expect(peakSummary(offset).dcOffset).toBeCloseTo(0.25, 2);
  });
});

describe("energyFrames", () => {
  it("follows the level through a signal that gets quiet", () => {
    const loud = sine(440, 0.5, 1);
    const quiet = sine(440, 0.5, 0.01);
    const signal = new Float32Array(loud.length + quiet.length);
    signal.set(loud, 0);
    signal.set(quiet, loud.length);
    const frames = energyFrames(signal, SAMPLE_RATE, 4800, 4800);
    expect(frames).toHaveLength(10);
    expect(amplitudeToDb(frames[0].rms)).toBeGreaterThan(-6);
    expect(amplitudeToDb(frames[9].rms)).toBeLessThan(-30);
    expect(frames[5].time).toBeCloseTo(0.5, 6);
  });

  it("returns nothing for empty input", () => {
    expect(energyFrames(new Float32Array(0), SAMPLE_RATE, 512, 512)).toEqual(
      []
    );
  });
});

describe("fftInPlace", () => {
  it("transforms a DC signal into a single bin", () => {
    const re = Float32Array.from([1, 1, 1, 1]);
    const im = new Float32Array(4);
    fftInPlace(re, im);
    expect(re[0]).toBeCloseTo(4, 6);
    expect(re[1]).toBeCloseTo(0, 6);
    expect(re[2]).toBeCloseTo(0, 6);
  });

  it("refuses a length that is not a power of two", () => {
    expect(() => fftInPlace(new Float32Array(3), new Float32Array(3))).toThrow(
      /power of two/
    );
  });
});

describe("floorPowerOfTwo", () => {
  it("rounds down to a power of two", () => {
    expect(floorPowerOfTwo(2048)).toBe(2048);
    expect(floorPowerOfTwo(3000)).toBe(2048);
    expect(floorPowerOfTwo(3)).toBe(2);
  });
});

describe("spectralFeatures", () => {
  it("puts a 1 kHz sine's centroid and peak at 1 kHz", () => {
    const fftSize = 4096;
    const magnitude = magnitudeSpectrum(
      sine(1000, 0.5),
      0,
      hannWindow(fftSize)
    );
    const features = spectralFeatures(magnitude, SAMPLE_RATE, fftSize);
    expect(features.peakHz).toBeCloseTo(1000, -1);
    expect(features.centroidHz).toBeGreaterThan(950);
    expect(features.centroidHz).toBeLessThan(1100);
    // A pure tone is maximally tonal, so flatness sits near zero.
    expect(features.flatness).toBeLessThan(0.05);
  });

  it("scores white noise as flatter and brighter than a sine", () => {
    const fftSize = 4096;
    const noise = new Float32Array(fftSize);
    let seed = 12345;
    for (let index = 0; index < fftSize; index += 1) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      noise[index] = (seed / 2147483648) * 2 - 1;
    }
    const window = hannWindow(fftSize);
    const noiseFeatures = spectralFeatures(
      magnitudeSpectrum(noise, 0, window),
      SAMPLE_RATE,
      fftSize
    );
    const toneFeatures = spectralFeatures(
      magnitudeSpectrum(sine(1000, 0.5), 0, window),
      SAMPLE_RATE,
      fftSize
    );
    expect(noiseFeatures.flatness).toBeGreaterThan(toneFeatures.flatness);
    expect(noiseFeatures.centroidHz).toBeGreaterThan(toneFeatures.centroidHz);
  });

  it("reports zeros for a silent frame", () => {
    const features = spectralFeatures(new Float32Array(64), SAMPLE_RATE, 128);
    expect(features).toMatchObject({ centroidHz: 0, energy: 0, peakHz: 0 });
  });
});

describe("bandEnergies", () => {
  it("puts a 100 Hz tone in the bass band and a 5 kHz tone in brilliance", () => {
    const fftSize = 8192;
    const window = hannWindow(fftSize);
    const energyIn = (frequency: number, band: string): number => {
      const bands = bandEnergies(
        magnitudeSpectrum(sine(frequency, 0.5), 0, window),
        SAMPLE_RATE,
        fftSize
      );
      return bands.find((entry) => entry.band.name === band)?.energy ?? 0;
    };
    expect(energyIn(100, "bass")).toBeGreaterThan(energyIn(100, "brilliance"));
    expect(energyIn(5000, "brilliance")).toBeGreaterThan(energyIn(5000, "bass"));
  });

  it("covers every declared band", () => {
    const bands = bandEnergies(new Float32Array(2049), SAMPLE_RATE, 4096);
    expect(bands.map((entry) => entry.band.name)).toEqual(
      OCTAVE_BANDS.map((band) => band.name)
    );
  });
});

describe("kWeightingFilters", () => {
  it("boosts 6 kHz and cuts 20 Hz relative to 1 kHz", () => {
    const [shelf, highPass] = kWeightingFilters(SAMPLE_RATE);
    const gain = (frequency: number): number => {
      const input = sine(frequency, 1);
      const output = applyBiquad(applyBiquad(input, shelf), highPass);
      // Skip the filter's settling transient before measuring.
      return peakSummary(output.subarray(SAMPLE_RATE / 2)).rms;
    };
    const reference = gain(1000);
    expect(gain(6000) / reference).toBeGreaterThan(1.3);
    expect(gain(20) / reference).toBeLessThan(0.25);
  });
});

describe("measureLoudness", () => {
  it("measures the BS.1770 reference signal at -20 LUFS", () => {
    // The scale's own anchor: a 1 kHz sine at -20 dBFS fed to left and right
    // simultaneously reads -20 LUFS. Off by more than a few tenths and the
    // K-weighting or the gating is wrong.
    const tone = sine(1000, 5, 10 ** (-20 / 20));
    const result = measureLoudness([tone, tone], SAMPLE_RATE);
    expect(Math.abs(result.integratedLufs + 20)).toBeLessThan(0.3);
    expect(result.momentary.length).toBeGreaterThan(40);
  });

  it("measures the same tone on one channel 3 LU quieter", () => {
    const tone = sine(1000, 5, 10 ** (-20 / 20));
    const mono = measureLoudness([tone], SAMPLE_RATE).integratedLufs;
    const stereo = measureLoudness([tone, tone], SAMPLE_RATE).integratedLufs;
    expect(stereo - mono).toBeCloseTo(3.01, 1);
  });

  it("tracks a level change one-for-one", () => {
    const loud = measureLoudness([sine(1000, 5, 0.1)], SAMPLE_RATE);
    const quiet = measureLoudness([sine(1000, 5, 0.01)], SAMPLE_RATE);
    expect(loud.integratedLufs - quiet.integratedLufs).toBeCloseTo(20, 1);
  });

  it("reports a wider loudness range for material that changes level", () => {
    const loud = sine(1000, 6, 10 ** (-14 / 20));
    const quiet = sine(1000, 6, 10 ** (-34 / 20));
    const varying = new Float32Array(loud.length + quiet.length);
    varying.set(loud, 0);
    varying.set(quiet, loud.length);
    const steady = sine(1000, 12, 10 ** (-14 / 20));
    expect(
      measureLoudness([varying], SAMPLE_RATE).loudnessRangeLu
    ).toBeGreaterThan(measureLoudness([steady], SAMPLE_RATE).loudnessRangeLu);
  });

  it("has no gated loudness for silence or for audio shorter than a block", () => {
    expect(
      measureLoudness([new Float32Array(SAMPLE_RATE)], SAMPLE_RATE)
        .integratedLufs
    ).toBe(Number.NEGATIVE_INFINITY);
    expect(
      measureLoudness([sine(1000, 0.1)], SAMPLE_RATE).integratedLufs
    ).toBe(Number.NEGATIVE_INFINITY);
    expect(measureLoudness([], SAMPLE_RATE).momentary).toEqual([]);
  });
});

describe("silenceSegments", () => {
  const frames = [
    { time: 0, rms: 0.5, peak: 0.5 },
    { time: 0.1, rms: 0, peak: 0 },
    { time: 0.2, rms: 0, peak: 0 },
    { time: 0.3, rms: 0, peak: 0 },
    { time: 0.4, rms: 0.5, peak: 0.5 },
    { time: 0.5, rms: 0, peak: 0 }
  ];

  it("finds runs under the threshold that last long enough", () => {
    expect(silenceSegments(frames, -40, 0.2, 0.1)).toEqual([
      { start: 0.1, end: 0.4, duration: 0.30000000000000004 }
    ]);
  });

  it("closes a trailing run at the end of the last frame", () => {
    expect(silenceSegments(frames, -40, 0.05, 0.1)).toHaveLength(2);
  });

  it("finds nothing when the minimum duration is longer than any run", () => {
    expect(silenceSegments(frames, -40, 1, 0.1)).toEqual([]);
  });
});

describe("invertSegments", () => {
  it("returns the gaps between segments", () => {
    const gaps = invertSegments(
      [{ start: 1, end: 2, duration: 1 }],
      3
    );
    expect(gaps).toEqual([
      { start: 0, end: 1, duration: 1 },
      { start: 2, end: 3, duration: 1 }
    ]);
  });

  it("returns the whole span when nothing is excluded", () => {
    expect(invertSegments([], 2)).toEqual([
      { start: 0, end: 2, duration: 2 }
    ]);
  });
});

describe("spectralFlux", () => {
  it("is 0 when nothing changes and 1 when everything is new", () => {
    const steady = Float32Array.from([1, 2, 3]);
    expect(spectralFlux(steady, steady)).toBeCloseTo(0, 6);
    expect(spectralFlux(steady, new Float32Array(3))).toBeCloseTo(1, 6);
  });

  it("ignores energy that fell away, counting only what rose", () => {
    expect(
      spectralFlux(Float32Array.from([1, 0]), Float32Array.from([0, 1]))
    ).toBeCloseTo(1, 6);
    expect(
      spectralFlux(Float32Array.from([0, 1]), Float32Array.from([1, 1]))
    ).toBeCloseTo(0, 6);
  });

  it("is scale-free, so one threshold serves a quiet and a loud passage", () => {
    const quiet = spectralFlux(
      Float32Array.from([0.02, 0.01]),
      Float32Array.from([0.01, 0.01])
    );
    const loud = spectralFlux(
      Float32Array.from([2, 1]),
      Float32Array.from([1, 1])
    );
    expect(quiet).toBeCloseTo(loud, 6);
  });

  it("stays near zero for a held tone's window-phase wobble", () => {
    // The failure this normalization exists for: a stationary 1 kHz sine at a
    // hop that is not a whole number of cycles. Raw flux is nonzero forever
    // and reads as a stream of onsets; measured against the frame's own
    // magnitude it is a couple of percent.
    const fftSize = 1024;
    const window = hannWindow(fftSize);
    const tone = sine(1000, 1);
    const hop = fftSize / 4;
    let worst = 0;
    for (let offset = 0; offset + fftSize + hop <= tone.length; offset += hop) {
      worst = Math.max(
        worst,
        spectralFlux(
          magnitudeSpectrum(tone, offset + hop, window),
          magnitudeSpectrum(tone, offset, window)
        )
      );
    }
    expect(worst).toBeLessThan(0.04);
  });

  it("reports a large fraction for a tone that starts", () => {
    const fftSize = 1024;
    const window = hannWindow(fftSize);
    const silence = new Float32Array(fftSize * 2);
    const tone = sine(1000, 1);
    expect(
      spectralFlux(
        magnitudeSpectrum(tone, 0, window),
        magnitudeSpectrum(silence, 0, window)
      )
    ).toBeGreaterThan(0.5);
  });
});

describe("detectOnsets", () => {
  it("finds the spikes in a novelty curve and ignores the noise floor", () => {
    const flux = Array.from({ length: 60 }, (_unused, index) =>
      index % 20 === 10 ? 10 : 0.1
    );
    const times = flux.map((_unused, index) => index * 0.01);
    expect(detectOnsets(flux, times)).toEqual([0.1, 0.3, 0.5]);
  });

  it("finds nothing in a flat curve", () => {
    const flat = Array.from({ length: 40 }, () => 1);
    const times = flat.map((_unused, index) => index * 0.01);
    expect(detectOnsets(flat, times)).toEqual([]);
  });

  it("ignores ripple that clears the adaptive threshold but not minStrength", () => {
    // Where the curve is nearly flat the local deviation collapses, so every
    // ripple clears mean + 1.5σ. Without the absolute floor a held note
    // reports dozens of onsets; this is that case.
    const ripple = Array.from({ length: 60 }, (_unused, index) =>
      index % 4 === 0 ? 0.012 : 0.01
    );
    const times = ripple.map((_unused, index) => index * 0.01);
    expect(detectOnsets(ripple, times)).toEqual([]);
    // Drop the floor below the ripple and the same peaks come back, so the
    // floor is what suppressed them and not the peak-picking.
    expect(
      detectOnsets(ripple, times, 1.5, 10, 0.05, 0.001).length
    ).toBeGreaterThan(5);
  });
});

describe("estimateTempo", () => {
  it("recovers 120 BPM from a novelty curve pulsing every 0.5 s", () => {
    const hop = 0.01;
    const novelty = Array.from({ length: 600 }, (_unused, index) =>
      index % 50 === 0 ? 1 : 0
    );
    const { bpm, confidence } = estimateTempo(novelty, hop);
    expect(bpm).toBeCloseTo(120, 0);
    expect(confidence).toBeGreaterThan(0.5);
  });

  it("has no confidence in a flat curve", () => {
    expect(estimateTempo(Array.from({ length: 100 }, () => 1), 0.01)).toEqual({
      bpm: 0,
      confidence: 0
    });
  });
});
