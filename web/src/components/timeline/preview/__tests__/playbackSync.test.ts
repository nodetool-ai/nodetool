import {
  clampVideoRate,
  decideVideoDrift,
  isClockAdvancing,
  resolvePlayStartMs,
  videoRateMode
} from "../playbackSync";

describe("videoRateMode (F12)", () => {
  it("multiplies the clip rate by the shuttle rate", () => {
    expect(videoRateMode(1, 2)).toEqual({ mode: "play", rate: 2 });
    expect(videoRateMode(1.5, 2)).toEqual({ mode: "play", rate: 3 });
  });

  it("scrubs reverse and stopped shuttle rates", () => {
    expect(videoRateMode(1, -1)).toEqual({ mode: "scrub" });
    expect(videoRateMode(1, 0)).toEqual({ mode: "scrub" });
  });

  it("scrubs a product outside what an element can play", () => {
    expect(videoRateMode(4, 8)).toEqual({ mode: "scrub" });
    expect(videoRateMode(0.01, 1)).toEqual({ mode: "scrub" });
  });

  it("clamps to the playable range", () => {
    expect(clampVideoRate(100)).toBe(16);
    expect(clampVideoRate(0)).toBe(0.0625);
  });
});

describe("decideVideoDrift (F11)", () => {
  const base = { fps: 24, baseRate: 1 };

  it("leaves a tiny error alone", () => {
    expect(decideVideoDrift({ ...base, elementSec: 10.01, targetSec: 10 })).toEqual({
      action: "none",
      rate: 1
    });
  });

  it("hard-seeks a seek inside the same clip", () => {
    const decision = decideVideoDrift({ ...base, elementSec: 4, targetSec: 20 });
    expect(decision.action).toBe("seek");
  });

  it("seeks past about one frame of error, in either direction", () => {
    expect(decideVideoDrift({ ...base, elementSec: 10.1, targetSec: 10 }).action).toBe("seek");
    expect(decideVideoDrift({ ...base, elementSec: 9.9, targetSec: 10 }).action).toBe("seek");
  });

  it("slows an element that is ahead and speeds one that is behind", () => {
    const ahead = decideVideoDrift({ ...base, elementSec: 10.03, targetSec: 10 });
    const behind = decideVideoDrift({ ...base, elementSec: 9.97, targetSec: 10 });
    expect(ahead.action).toBe("nudge");
    expect(ahead.rate).toBeLessThan(1);
    expect(behind.action).toBe("nudge");
    expect(behind.rate).toBeGreaterThan(1);
  });

  it("nudges around the shuttle rate, not around 1", () => {
    const decision = decideVideoDrift({ ...base, baseRate: 2, elementSec: 10.03, targetSec: 10 });
    expect(decision.rate).toBeLessThan(2);
    expect(decision.rate).toBeGreaterThan(1.7);
  });
});

describe("resolvePlayStartMs (F26)", () => {
  const range = { loopStartMs: 0, endMs: 10_000, frameMs: 40 };

  it("restarts at the top when forward playback is parked at the end", () => {
    expect(resolvePlayStartMs({ ...range, startMs: 10_000, rate: 1 })).toBe(0);
  });

  it("plays reverse from the end instead of jumping to the top", () => {
    expect(resolvePlayStartMs({ ...range, startMs: 10_000, rate: -1 })).toBe(10_000);
  });

  it("restarts reverse playback parked at the top from the end", () => {
    expect(resolvePlayStartMs({ ...range, startMs: 0, rate: -1 })).toBe(10_000);
  });

  it("keeps forward playback at the top where it is", () => {
    expect(resolvePlayStartMs({ ...range, startMs: 0, rate: 1 })).toBe(0);
  });

  it("restarts at the in point", () => {
    expect(
      resolvePlayStartMs({ ...range, loopStartMs: 2000, startMs: 10_000, rate: 2 })
    ).toBe(2000);
  });

  it("leaves a mid-timeline position and an empty timeline alone", () => {
    expect(resolvePlayStartMs({ ...range, startMs: 5000, rate: -1 })).toBe(5000);
    expect(resolvePlayStartMs({ ...range, endMs: 0, startMs: 0, rate: 1 })).toBe(0);
  });
});

describe("isClockAdvancing (F25)", () => {
  it("is false before the clock has moved", () => {
    expect(isClockAdvancing(1000, Number.NEGATIVE_INFINITY)).toBe(false);
  });

  it("is true shortly after the position moved and false once it stalls", () => {
    expect(isClockAdvancing(1100, 1000)).toBe(true);
    expect(isClockAdvancing(1300, 1000)).toBe(false);
  });
});
