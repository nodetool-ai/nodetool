import { shouldPresentFrame } from "../source";

describe("shouldPresentFrame", () => {
  it("presents an empty scene (clears to black — a real gap)", () => {
    expect(shouldPresentFrame(0, 0)).toBe(true);
  });

  it("holds the last frame when layers exist but none decoded yet", () => {
    // The incoming clip at a cut is still seeking — presenting would flash
    // opaque black. Hold the previously-presented frame instead.
    expect(shouldPresentFrame(1, 0)).toBe(false);
    expect(shouldPresentFrame(3, 0)).toBe(false);
  });

  it("presents when at least one layer drew", () => {
    expect(shouldPresentFrame(1, 1)).toBe(true);
    expect(shouldPresentFrame(3, 1)).toBe(true);
    expect(shouldPresentFrame(2, 2)).toBe(true);
  });
});
