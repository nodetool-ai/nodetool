/**
 * @jest-environment node
 */
import { describe, it, expect, beforeEach } from "@jest/globals";
import { StrokeAssist } from "../StrokeAssist";
import { StabilizerBuffer } from "../StabilizerBuffer";
import type { StrokeAssistSettings } from "../../types";

function settings(overrides: Partial<StrokeAssistSettings> = {}): StrokeAssistSettings {
  return {
    preset: "custom",
    mode: "stabilizer",
    strength: 0.5,
    snapMode: "off",
    snapStrength: 0.75,
    angleIncrement: 45,
    ...overrides
  };
}

describe("StabilizerBuffer", () => {
  let buffer: StabilizerBuffer;

  beforeEach(() => {
    buffer = new StabilizerBuffer();
  });

  it("returns raw point when strength is 0", () => {
    const raw = { x: 100, y: 200 };
    expect(buffer.apply(raw, 0)).toEqual(raw);
  });

  it("returns raw point unchanged for a single sample", () => {
    const raw = { x: 50, y: 75 };
    const result = buffer.apply(raw, 0.5);
    expect(result).toEqual(raw);
  });

  it("averages multiple points", () => {
    buffer.apply({ x: 0, y: 0 }, 0.5);
    const result = buffer.apply({ x: 10, y: 20 }, 0.5);
    expect(result.x).toBeCloseTo(5);
    expect(result.y).toBeCloseTo(10);
  });

  it("produces a smoothed trajectory over many points", () => {
    const outputs: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < 10; i++) {
      outputs.push(buffer.apply({ x: i * 10, y: 0 }, 0.3));
    }
    expect(outputs[outputs.length - 1].x).toBeLessThanOrEqual(90);
    expect(outputs[outputs.length - 1].x).toBeGreaterThan(0);
  });

  it("resets clears accumulated state", () => {
    buffer.apply({ x: 100, y: 100 }, 0.5);
    buffer.apply({ x: 200, y: 200 }, 0.5);
    buffer.reset();
    const fresh = buffer.apply({ x: 0, y: 0 }, 0.5);
    expect(fresh).toEqual({ x: 0, y: 0 });
  });

  it("higher strength produces more smoothing", () => {
    const bufferLow = new StabilizerBuffer();
    const bufferHigh = new StabilizerBuffer();

    for (let i = 0; i < 5; i++) {
      bufferLow.apply({ x: i * 10, y: 0 }, 0.1);
      bufferHigh.apply({ x: i * 10, y: 0 }, 0.9);
    }

    const lowResult = bufferLow.apply({ x: 100, y: 0 }, 0.1);
    const highResult = bufferHigh.apply({ x: 100, y: 0 }, 0.9);

    expect(highResult.x).toBeLessThan(lowResult.x);
  });
});

describe("StrokeAssist", () => {
  let assist: StrokeAssist;

  beforeEach(() => {
    assist = new StrokeAssist();
  });

  it("returns the first point unchanged", () => {
    const result = assist.apply({ x: 50, y: 60 }, settings());
    expect(result).toEqual({ x: 50, y: 60 });
  });

  describe("stabilizer mode", () => {
    it("smooths subsequent points", () => {
      assist.apply({ x: 0, y: 0 }, settings({ mode: "stabilizer", strength: 0.5 }));
      const result = assist.apply({ x: 100, y: 100 }, settings({ mode: "stabilizer", strength: 0.5 }));
      expect(result.x).toBeGreaterThan(0);
      expect(result.x).toBeLessThanOrEqual(100);
    });
  });

  describe("lazy brush mode", () => {
    it("stays put when movement is within the leash radius", () => {
      const s = settings({ mode: "lazy", strength: 0.5 });
      assist.apply({ x: 50, y: 50 }, s);
      const result = assist.apply({ x: 51, y: 51 }, s);
      expect(result).toEqual({ x: 50, y: 50 });
    });

    it("follows when movement exceeds the leash radius", () => {
      const s = settings({ mode: "lazy", strength: 0 });
      assist.apply({ x: 0, y: 0 }, s);
      const result = assist.apply({ x: 100, y: 0 }, s);
      expect(result.x).toBeGreaterThan(0);
    });

    it("higher strength means larger leash radius", () => {
      const sLow = settings({ mode: "lazy", strength: 0.1 });
      const sHigh = settings({ mode: "lazy", strength: 0.9 });

      const assistLow = new StrokeAssist();
      const assistHigh = new StrokeAssist();

      assistLow.apply({ x: 0, y: 0 }, sLow);
      assistHigh.apply({ x: 0, y: 0 }, sHigh);

      const rLow = assistLow.apply({ x: 30, y: 0 }, sLow);
      const rHigh = assistHigh.apply({ x: 30, y: 0 }, sHigh);

      expect(rHigh.x).toBeLessThan(rLow.x);
    });
  });

  describe("angle snap", () => {
    it("snaps to angle increments when distance is sufficient", () => {
      const s = settings({
        mode: "stabilizer",
        strength: 0,
        snapMode: "angle",
        snapStrength: 1.0,
        angleIncrement: 90
      });

      assist.apply({ x: 0, y: 0 }, s);
      const result = assist.apply({ x: 20, y: 20 }, s);
      const snappedAngle = Math.atan2(result.y, result.x) * (180 / Math.PI);
      const nearestMultiple = Math.round(snappedAngle / 90) * 90;
      expect(Math.abs(snappedAngle - nearestMultiple)).toBeLessThan(1);
    });

    it("does not snap when distance is below threshold", () => {
      const s = settings({
        mode: "stabilizer",
        strength: 0,
        snapMode: "angle",
        snapStrength: 1.0,
        angleIncrement: 90
      });

      assist.apply({ x: 0, y: 0 }, s);
      const result = assist.apply({ x: 2, y: 3 }, s);
      expect(result.x).toBeCloseTo(2);
      expect(result.y).toBeCloseTo(3);
    });
  });

  it("resets accumulated state", () => {
    const s = settings({ mode: "lazy", strength: 0.5 });
    assist.apply({ x: 0, y: 0 }, s);
    assist.apply({ x: 100, y: 100 }, s);
    assist.reset();

    const fresh = assist.apply({ x: 50, y: 60 }, s);
    expect(fresh).toEqual({ x: 50, y: 60 });
  });
});
