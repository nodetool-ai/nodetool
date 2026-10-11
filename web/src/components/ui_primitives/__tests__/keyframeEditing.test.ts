import { evaluateParticleCurve, evaluateParticleGradient } from "@nodetool-ai/game-renderer";

import {
  clampKeyTime,
  draggedCoordinate,
  evaluateCurveKeys,
  evaluateGradientStops,
  insertKey,
  insertionTime,
  removeKey,
  updateKey
} from "../keyframeEditing";

const keys = [{ t: 0, value: 1 }, { t: 0.5, value: 3 }, { t: 1, value: 0 }];

describe("keyframeEditing", () => {
  it("clamps a moved key between its neighbours so keys never reorder", () => {
    expect(clampKeyTime(keys, 1, 2)).toBe(1);
    expect(clampKeyTime(keys, 1, -1)).toBe(0);
    expect(updateKey(keys, 0, { t: 0.9 })).toEqual([{ t: 0.5, value: 1 }, keys[1], keys[2]]);
  });

  it("keeps at least minKeys keys", () => {
    expect(removeKey([{ t: 0, value: 1 }], 0)).toEqual([{ t: 0, value: 1 }]);
    expect(removeKey(keys, 1)).toEqual([keys[0], keys[2]]);
  });

  it("places a new key halfway to the next key, or to the previous one at the end", () => {
    expect(insertionTime(keys, 0)).toBe(0.25);
    expect(insertionTime(keys, 2)).toBe(0.75);
    expect(insertionTime([{ t: 0.4 }], 0)).toBe(0.7);
    expect(insertKey(keys, { t: 0.75, value: 2 })).toEqual({ keys: [keys[0], keys[1], { t: 0.75, value: 2 }, keys[2]], index: 2 });
  });

  it("evaluates curves and gradients piecewise-linearly, holding the ends", () => {
    expect(evaluateCurveKeys(keys, 0.25)).toBe(2);
    expect(evaluateCurveKeys([{ t: 0.5, value: 4 }], 0)).toBe(4);
    expect(evaluateGradientStops([{ t: 0, color: "#000000" }, { t: 1, color: "#ff0080" }], 0.5)).toBe("#800040");
    expect(evaluateGradientStops([{ t: 0.5, color: "#123456" }], 1)).toBe("#123456");
  });

  it("keeps an off-grid coordinate until the drag leaves its grid cell", () => {
    expect(draggedCoordinate(0.333, 0.33, 0.01)).toBe(0.333);
    expect(draggedCoordinate(0.333, 0.34, 0.01)).toBe(0.34);
  });

  it("evaluates exactly as the particle runtime does", () => {
    const curves = [
      [{ t: 0, value: 1 }, { t: 0.5, value: 3 }, { t: 1, value: 0 }],
      [{ t: 0.2, value: 4 }, { t: 0.2, value: 8 }, { t: 0.7, value: 2.5 }],
      [{ t: 0.5, value: 7 }]
    ];
    const gradients = [
      [{ t: 0, color: "#000000" }, { t: 1, color: "#ff0080" }],
      [{ t: 0.1, color: "#123456" }, { t: 0.4, color: "#abcdef" }, { t: 0.4, color: "#fedcba" }, { t: 0.9, color: "#00ff00" }],
      [{ t: 0.3, color: "#336699" }]
    ];
    const samples = Array.from({ length: 41 }, (_, index) => index / 40);
    for (const curve of curves) {
      for (const t of samples) {
        expect(evaluateCurveKeys(curve, t)).toBeCloseTo(evaluateParticleCurve(curve, t), 10);
      }
    }
    for (const gradient of gradients) {
      for (const t of samples) {
        // The runtime keeps float channels; the editor must produce `#rrggbb`, so it may differ by the 8-bit rounding only.
        const runtime = evaluateParticleGradient(gradient, t);
        const editor = evaluateGradientStops(gradient, t);
        const channels = [1, 3, 5].map((offset) => Number.parseInt(editor.slice(offset, offset + 2), 16));
        [runtime.r, runtime.g, runtime.b].forEach((channel, index) => {
          expect(Math.abs(channels[index] - channel * 255)).toBeLessThanOrEqual(0.5 + 1e-9);
        });
      }
    }
  });
});
