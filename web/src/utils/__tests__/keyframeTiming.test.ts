import {
  formatKeyframeTime,
  keyframePosition,
  stripDuration,
  timeAtPosition
} from "../keyframeTiming";

describe("keyframeTiming", () => {
  it("reads the duration from the node, then its default, then the keyframes", () => {
    expect(stripDuration("8", 5, [])).toBe(8);
    expect(stripDuration(undefined, 5, [])).toBe(5);
    expect(stripDuration(undefined, undefined, [2.2, 6.5])).toBe(7);
    expect(stripDuration(undefined, undefined, [])).toBe(1);
  });

  it("clamps positions to the strip", () => {
    expect(keyframePosition(2.5, 5)).toBe(0.5);
    expect(keyframePosition(9, 5)).toBe(1);
    expect(keyframePosition(1, 0)).toBe(0);
  });

  it("snaps a pointer position to tenths of a second", () => {
    expect(timeAtPosition(0.333, 5)).toBe(1.7);
    expect(timeAtPosition(-1, 5)).toBe(0);
    expect(timeAtPosition(2, 5)).toBe(5);
  });

  it("labels times without trailing zeros", () => {
    expect(formatKeyframeTime(1.5)).toBe("1.5 s");
    expect(formatKeyframeTime(3)).toBe("3 s");
  });
});
