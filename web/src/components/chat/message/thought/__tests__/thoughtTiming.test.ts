import {
  markThoughtDone,
  markThoughtRunning,
  resetThoughtTimings,
  thoughtDuration
} from "../thoughtTiming";

describe("thoughtTiming", () => {
  beforeEach(() => resetThoughtTimings());

  it("times a block from its first streamed text to its end", () => {
    markThoughtRunning("Let", 1000);
    markThoughtRunning("Let me check the numbers", 2000);
    expect(markThoughtDone("Let me check the numbers again.", 6000)).toBe(5000);
    expect(thoughtDuration("Let me check the numbers again.")).toBe(5000);
  });

  it("does not resume a finished block that opened with the same words", () => {
    markThoughtRunning("Let me check A", 0);
    markThoughtDone("Let me check A", 1000);
    markThoughtRunning("Let me check B", 5000);
    expect(markThoughtDone("Let me check B", 8000)).toBe(3000);
    expect(thoughtDuration("Let me check A")).toBe(1000);
  });

  it("has no duration for a block it never saw streaming", () => {
    expect(markThoughtDone("Loaded from history")).toBeNull();
    expect(thoughtDuration("Loaded from history")).toBeNull();
  });
});
