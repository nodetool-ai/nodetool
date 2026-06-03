/**
 * @jest-environment node
 */
import { StabilizerBuffer } from "../StabilizerBuffer";

describe("StabilizerBuffer", () => {
  let buffer: StabilizerBuffer;

  beforeEach(() => {
    buffer = new StabilizerBuffer();
  });

  it("returns the raw point unchanged when strength is 0", () => {
    const pt = { x: 10, y: 20 };
    expect(buffer.apply(pt, 0)).toBe(pt);
  });

  it("returns the raw point unchanged when strength is negative", () => {
    const pt = { x: 5, y: 15 };
    expect(buffer.apply(pt, -1)).toBe(pt);
  });

  it("returns the first point unchanged regardless of strength", () => {
    const pt = { x: 100, y: 200 };
    const result = buffer.apply(pt, 0.5);
    expect(result).toEqual(pt);
  });

  it("averages points with non-zero strength", () => {
    buffer.apply({ x: 0, y: 0 }, 0.5);
    const result = buffer.apply({ x: 10, y: 20 }, 0.5);
    expect(result.x).toBe(5);
    expect(result.y).toBe(10);
  });

  it("produces more smoothing at higher strength", () => {
    const lowBuffer = new StabilizerBuffer();
    const highBuffer = new StabilizerBuffer();

    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 30; i++) {
      points.push({ x: i % 2 === 0 ? 0 : 100, y: 0 });
    }

    const lowResults = points.map((p) => lowBuffer.apply(p, 0.1));
    const highResults = points.map((p) => highBuffer.apply(p, 1.0));

    const lowVariance =
      Math.max(...lowResults.map((r) => r.x)) -
      Math.min(...lowResults.map((r) => r.x));
    const highVariance =
      Math.max(...highResults.map((r) => r.x)) -
      Math.min(...highResults.map((r) => r.x));

    expect(highVariance).toBeLessThan(lowVariance);
  });

  it("resets the internal buffer", () => {
    buffer.apply({ x: 0, y: 0 }, 0.5);
    buffer.apply({ x: 100, y: 100 }, 0.5);

    buffer.reset();

    const result = buffer.apply({ x: 50, y: 50 }, 0.5);
    expect(result).toEqual({ x: 50, y: 50 });
  });

  it("limits the window size so old points drop off", () => {
    for (let i = 0; i < 30; i++) {
      buffer.apply({ x: i, y: i }, 0.5);
    }
    const result = buffer.apply({ x: 100, y: 100 }, 0.5);
    expect(result.x).toBeGreaterThan(0);
    expect(result.x).toBeLessThan(100);
  });
});
