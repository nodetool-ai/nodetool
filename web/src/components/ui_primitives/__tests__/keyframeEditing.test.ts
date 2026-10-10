import {
  clampKeyTime,
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
});
