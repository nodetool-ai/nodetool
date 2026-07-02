import { buildChannelPeaks, peakRange } from "../waveformPeaks";

const bruteForce = (
  data: Float32Array,
  start: number,
  end: number
): { min: number; max: number } | null => {
  const lo = Math.max(0, start);
  const hi = Math.min(data.length, end);
  if (hi <= lo) return null;
  let min = Infinity;
  let max = -Infinity;
  for (let i = lo; i < hi; i += 1) {
    if (data[i] < min) min = data[i];
    if (data[i] > max) max = data[i];
  }
  return { min, max };
};

/** Deterministic pseudo-random signal so ranges hit varied values. */
const makeSignal = (length: number): Float32Array => {
  const data = new Float32Array(length);
  let x = 42;
  for (let i = 0; i < length; i += 1) {
    x = (x * 1103515245 + 12345) % 2147483648;
    data[i] = (x / 2147483648) * 2 - 1;
  }
  return data;
};

describe("buildChannelPeaks", () => {
  it("stores per-block min/max", () => {
    const data = Float32Array.from([0.1, -0.5, 0.3, 0.9, -0.2, 0.0]);
    const peaks = buildChannelPeaks(data, 3);
    expect(peaks.min[0]).toBeCloseTo(-0.5);
    expect(peaks.max[0]).toBeCloseTo(0.3);
    expect(peaks.min[1]).toBeCloseTo(-0.2);
    expect(peaks.max[1]).toBeCloseTo(0.9);
  });

  it("handles a trailing partial block", () => {
    const data = Float32Array.from([1, -1, 0.5]);
    const peaks = buildChannelPeaks(data, 2);
    expect(peaks.min.length).toBe(2);
    expect(peaks.min[1]).toBeCloseTo(0.5);
    expect(peaks.max[1]).toBeCloseTo(0.5);
  });
});

describe("peakRange", () => {
  const data = makeSignal(1000);
  const peaks = buildChannelPeaks(data, 32);

  it.each([
    ["whole signal", 0, 1000],
    ["block-aligned", 64, 320],
    ["partial edges", 5, 995],
    ["within one block", 40, 50],
    ["single sample", 40, 41],
    ["straddling one boundary", 30, 40],
    ["start on boundary", 32, 45],
    ["end on boundary", 45, 64]
  ])("matches a raw scan (%s)", (_label, start, end) => {
    expect(peakRange(data, peaks, start, end)).toEqual(
      bruteForce(data, start, end)
    );
  });

  it("clamps out-of-bounds ranges", () => {
    expect(peakRange(data, peaks, -10, 2000)).toEqual(
      bruteForce(data, 0, 1000)
    );
  });

  it("returns null for empty ranges", () => {
    expect(peakRange(data, peaks, 10, 10)).toBeNull();
    expect(peakRange(data, peaks, 50, 40)).toBeNull();
    expect(peakRange(data, peaks, 1000, 1200)).toBeNull();
  });
});
