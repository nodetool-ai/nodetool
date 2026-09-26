import { describe, expect, it } from "vitest";
import { parseFrameSpec } from "../timeline-render.js";

describe("parseFrameSpec", () => {
  it("reads indices and inclusive ranges into sorted unique frames", () => {
    expect(parseFrameSpec("290, 175,5-7,6", 450)).toEqual([5, 6, 7, 175, 290]);
  });

  it("accepts the last frame and refuses the one after it", () => {
    expect(parseFrameSpec("449", 450)).toEqual([449]);
    expect(() => parseFrameSpec("440-450", 450)).toThrow(/frames 0-449/);
  });

  it.each(["abc", "5-", "-5", "1.5", "3-1"])("refuses %j", (spec) => {
    expect(() => parseFrameSpec(spec, 450)).toThrow();
  });

  it("refuses an empty selection", () => {
    expect(() => parseFrameSpec(" , ", 450)).toThrow(/empty/);
  });
});
