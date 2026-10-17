import type { TimelineTempo } from "@nodetool-ai/timeline";

import { defaultLoopRange, formatBarsBeatsTicks } from "../loopRange";

const TEMPO: TimelineTempo = {
  bpm: 120,
  offsetMs: 0,
  timeSignature: { beatsPerBar: 4, beatUnit: 4 }
};

describe("defaultLoopRange", () => {
  it("covers the selected clips", () => {
    expect(
      defaultLoopRange({
        selectedClips: [
          { startMs: 1000, durationMs: 500 },
          { startMs: 3000, durationMs: 1000 }
        ],
        viewStartMs: 0,
        viewEndMs: 20_000,
        playheadMs: 0,
        tempo: TEMPO
      })
    ).toEqual({ inMs: 1000, outMs: 4000 });
  });

  it("covers the whole bars on screen when nothing is selected", () => {
    // Bars are 2 s long; the view shows 2.5 s .. 11 s: bars 3 to 5.
    expect(
      defaultLoopRange({
        selectedClips: [],
        viewStartMs: 2500,
        viewEndMs: 11_000,
        playheadMs: 0,
        tempo: TEMPO
      })
    ).toEqual({ inMs: 4000, outMs: 10_000 });
  });

  it("falls back to four bars from the playhead's bar when the view is unknown", () => {
    expect(
      defaultLoopRange({
        selectedClips: [],
        viewStartMs: 0,
        viewEndMs: 0,
        playheadMs: 4500,
        tempo: TEMPO
      })
    ).toEqual({ inMs: 4000, outMs: 12_000 });
  });
});

describe("formatBarsBeatsTicks", () => {
  it("reads bar, beat and tick", () => {
    expect(formatBarsBeatsTicks(0, TEMPO)).toBe("1:1:000");
    expect(formatBarsBeatsTicks(2750, TEMPO)).toBe("2:2:480");
  });
});
