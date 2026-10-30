import { applyAudioEdit, summarizePeaks } from "../audioAgentOps";
import { sampleDuration, type AudioSample } from "../audioSample";

const makeSample = (channels: number[][], sampleRate = 4): AudioSample => ({
  sampleRate,
  channels: channels.map((c) => Float32Array.from(c))
});

const frames = (sample: AudioSample) => Array.from(sample.channels[0]);

describe("applyAudioEdit", () => {
  const sample = makeSample([[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]]);

  it("trims to the range", () => {
    const out = applyAudioEdit(sample, "trim", { start: 0.5, end: 1.5 });
    expect(frames(out)).toEqual([0.3, 0.4, 0.5, 0.6].map(Math.fround));
  });

  it("deletes the range", () => {
    const out = applyAudioEdit(sample, "delete", { start: 0, end: 1.5 });
    expect(frames(out)).toEqual([0.7, 0.8].map(Math.fround));
  });

  it("refuses trim and delete without a range", () => {
    expect(() => applyAudioEdit(sample, "trim")).toThrow('"trim" needs a range');
    expect(() => applyAudioEdit(sample, "delete")).toThrow('"delete" needs a range');
  });

  it("applies whole-sample edits when the range is omitted", () => {
    expect(frames(applyAudioEdit(sample, "silence"))).toEqual(new Array(8).fill(0));
    expect(frames(applyAudioEdit(sample, "reverse"))).toEqual(
      [...frames(sample)].reverse()
    );
    expect(Math.max(...frames(applyAudioEdit(sample, "normalize")))).toBeCloseTo(1);
    const faded = frames(applyAudioEdit(sample, "fade_out"));
    expect(faded[0]).toBeCloseTo(0.1);
    expect(faded[7]).toBe(0);
  });

  it("converts gain from decibels", () => {
    const out = applyAudioEdit(sample, "gain", undefined, 20);
    expect(frames(out)[0]).toBeCloseTo(1);
    expect(() => applyAudioEdit(sample, "gain")).toThrow("needs gain_db");
  });

  it("leaves the input untouched", () => {
    const before = frames(sample);
    applyAudioEdit(sample, "silence");
    expect(frames(sample)).toEqual(before);
  });
});

describe("summarizePeaks", () => {
  it("reports the loudest level of each window across channels", () => {
    const sample = makeSample(
      [
        [0.1, -0.9, 0, 0, 0.2, 0.2, 0, 0],
        [0.3, 0.1, 0, 0, -0.5, 0, 0, 0]
      ],
      10
    );
    // 0.8 s at 10 Hz: the minimum 0.1 s window holds one frame.
    expect(summarizePeaks(sample)).toEqual({
      peaks: [0.3, 0.9, 0, 0, 0.5, 0.2, 0, 0],
      windowSeconds: 0.1
    });
  });

  it("widens the window so long audio stays a short list", () => {
    const sample = makeSample([new Array(10 * 600).fill(0.5)], 10);
    expect(sampleDuration(sample)).toBe(600);
    const { peaks, windowSeconds } = summarizePeaks(sample);
    expect(windowSeconds).toBe(5);
    expect(peaks).toHaveLength(120);
    expect(peaks.every((peak) => peak === 0.5)).toBe(true);
  });

  it("is empty for an empty sample", () => {
    expect(summarizePeaks(makeSample([[]])).peaks).toEqual([]);
  });
});
