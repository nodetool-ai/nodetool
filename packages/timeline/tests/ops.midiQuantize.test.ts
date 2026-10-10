import { describe, expect, it } from "vitest";
import { makeClip, makeTrack } from "../src/index.js";
import { DEFAULT_TEMPO } from "../src/midi/tempo.js";
import { applyTimelineOp } from "../src/ops/apply.js";
import type { TimelineOpContext, TimelineOpState } from "../src/ops/types.js";

function context(): TimelineOpContext {
  let n = 0;
  return { newId: (kind) => `${kind}_${++n}` };
}

describe("quantize_notes", () => {
  it("snaps to the grid anchored at the tempo offset, as the piano roll draws it", async () => {
    const state: TimelineOpState = {
      fps: 30,
      width: 1920,
      height: 1080,
      tracks: [makeTrack({ id: "keys", type: "midi", name: "Keys", index: 0 })],
      clips: [
        makeClip({
          id: "phrase",
          trackId: "keys",
          name: "Phrase",
          startMs: 0,
          durationMs: 4000,
          mediaType: "midi",
          notes: [
            { id: "n1", pitch: 60, velocity: 100, startTick: 400, durationTick: 240 }
          ]
        })
      ],
      markers: [],
      tempo: { ...DEFAULT_TEMPO, bpm: 120, offsetMs: 250 },
      playheadMs: 0,
      selectedClipIds: []
    };

    const out = await applyTimelineOp(
      state,
      { op: "quantize_notes", clip: "phrase", division: "1/4" },
      context()
    );

    expect(out.error).toBeUndefined();
    expect(out.state.clips[0]?.notes?.[0]?.startTick).toBe(480);
  });
});
