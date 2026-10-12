import { makeAudioSample, type AudioSample } from "../audioSample";
import {
  bitcrush,
  compress,
  compressorCurve,
  dbToGain,
  distort,
  invert,
  limit,
  noiseGate,
  removeDcOffset,
  tremolo
} from "../effectsDsp";

const makeSample = (channels: number[][], sampleRate = 1000): AudioSample =>
  makeAudioSample(
    sampleRate,
    channels.map((c) => Float32Array.from(c))
  );

const constant = (value: number, frames: number, sampleRate = 1000) =>
  makeSample([new Array(frames).fill(value)], sampleRate);

const peak = (sample: AudioSample): number =>
  Math.max(...sample.channels.flatMap((c) => Array.from(c, Math.abs)));

describe("compressorCurve", () => {
  const params = {
    thresholdDb: -20,
    ratio: 4,
    kneeDb: 0,
    attackMs: 0,
    releaseMs: 0,
    makeupDb: 0
  };

  it("leaves levels below the threshold alone", () => {
    expect(compressorCurve(-30, params)).toBe(0);
  });

  it("reduces the overshoot by the ratio above the threshold", () => {
    // 12 dB over at 4:1 comes out 3 dB over: 9 dB of reduction.
    expect(compressorCurve(-8, params)).toBeCloseTo(-9);
  });

  it("joins the two slopes smoothly inside the knee", () => {
    const soft = { ...params, kneeDb: 6 };
    expect(compressorCurve(-23, soft)).toBeCloseTo(0);
    expect(compressorCurve(-17, soft)).toBeCloseTo(compressorCurve(-17, params));
    expect(compressorCurve(-20, soft)).toBeLessThan(0);
  });
});

describe("compress", () => {
  it("settles a loud steady signal to the compressed level", () => {
    const loud = constant(dbToGain(-8), 2000);
    const out = compress(loud, {
      thresholdDb: -20,
      ratio: 4,
      kneeDb: 0,
      attackMs: 1,
      releaseMs: 50,
      makeupDb: 0
    });
    expect(20 * Math.log10(out.channels[0][1999])).toBeCloseTo(-17, 1);
  });

  it("applies makeup gain to quiet audio", () => {
    const quiet = constant(0.1, 10);
    const out = compress(quiet, {
      thresholdDb: -6,
      ratio: 4,
      kneeDb: 0,
      attackMs: 1,
      releaseMs: 50,
      makeupDb: 6
    });
    expect(out.channels[0][5]).toBeCloseTo(0.1 * dbToGain(6));
  });
});

describe("limit", () => {
  it("keeps every sample at or below the ceiling", () => {
    const frames = Array.from({ length: 500 }, (_, i) =>
      Math.sin(i / 7) * (i > 200 && i < 260 ? 1.8 : 0.3)
    );
    const out = limit(makeSample([frames, frames.map((v) => -v)]), {
      ceilingDb: -1,
      lookaheadMs: 5,
      releaseMs: 50
    });
    expect(peak(out)).toBeLessThanOrEqual(dbToGain(-1) + 1e-6);
  });

  it("does not change audio already under the ceiling", () => {
    const out = limit(makeSample([[0.1, -0.2, 0.3]]), {
      ceilingDb: 0,
      lookaheadMs: 5,
      releaseMs: 50
    });
    expect(Array.from(out.channels[0])).toEqual(
      Array.from(Float32Array.from([0.1, -0.2, 0.3]))
    );
  });
});

describe("noiseGate", () => {
  const params = {
    thresholdDb: -20,
    reductionDb: -60,
    attackMs: 0,
    holdMs: 0,
    releaseMs: 0
  };

  it("turns down audio below the threshold", () => {
    const out = noiseGate(constant(0.01, 10), params);
    expect(out.channels[0][9]).toBeCloseTo(0.01 * dbToGain(-60));
  });

  it("passes audio above the threshold", () => {
    const out = noiseGate(constant(0.5, 10), params);
    expect(out.channels[0][9]).toBeCloseTo(0.5);
  });

  it("stays open through the hold time after the level drops", () => {
    const input = makeSample([[0.5, 0.01, 0.01, 0.01, 0.01, 0.01]]);
    const out = noiseGate(input, { ...params, holdMs: 3 });
    expect(out.channels[0][3]).toBeCloseTo(0.01);
    expect(out.channels[0][5]).toBeCloseTo(0.01 * dbToGain(-60));
  });
});

describe("distort", () => {
  it("keeps full scale at full scale and lifts quiet samples", () => {
    const out = distort(makeSample([[1, -1, 0.1]]), {
      driveDb: 20,
      outputDb: 0,
      mix: 1
    });
    expect(out.channels[0][0]).toBeCloseTo(1);
    expect(out.channels[0][1]).toBeCloseTo(-1);
    expect(out.channels[0][2]).toBeGreaterThan(0.5);
  });

  it("returns the dry signal at zero mix", () => {
    const out = distort(makeSample([[0.3]]), {
      driveDb: 20,
      outputDb: 0,
      mix: 0
    });
    expect(out.channels[0][0]).toBeCloseTo(0.3);
  });
});

describe("bitcrush", () => {
  it("quantizes and holds samples", () => {
    const out = bitcrush(makeSample([[0.3, 0.9, 0.6, 0.1]]), {
      bits: 2,
      downsample: 2,
      mix: 1
    });
    // 2 bits → steps of 0.5; frames 1 and 3 repeat frames 0 and 2.
    expect(Array.from(out.channels[0])).toEqual([0.5, 0.5, 0.5, 0.5]);
  });
});

describe("tremolo", () => {
  it("starts at full level and dips by the depth", () => {
    // 250 Hz at 1 kHz: the trough falls on frame 2.
    const out = tremolo(constant(1, 5), { rateHz: 250, depth: 0.5 });
    expect(out.channels[0][0]).toBeCloseTo(1);
    expect(out.channels[0][2]).toBeCloseTo(0.5);
  });
});

describe("invert and removeDcOffset", () => {
  it("flips polarity", () => {
    expect(Array.from(invert(makeSample([[0.5, -0.25, 0]])).channels[0])).toEqual(
      [-0.5, 0.25, 0]
    );
  });

  it("centres each channel on zero", () => {
    const out = removeDcOffset(makeSample([[0.5, 0.7, 0.3], [-1, -1, -1]]));
    expect(out.channels[0][0]).toBeCloseTo(0);
    expect(out.channels[0][1]).toBeCloseTo(0.2);
    expect(Array.from(out.channels[1])).toEqual([0, 0, 0]);
  });

  it("does not mutate the input", () => {
    const input = makeSample([[0.5, 0.7]]);
    removeDcOffset(input);
    invert(input);
    expect(Array.from(input.channels[0])).toEqual(
      Array.from(Float32Array.from([0.5, 0.7]))
    );
  });
});
