/**
 * Beat grids and clip snapping (T20, F23).
 *
 * The cases are analytic: a 120 BPM grid is a beat every 500 ms, so a clip
 * 30 ms off a beat is inside the default 60 ms tolerance and a clip 90 ms off
 * is not, whatever the implementation does internally.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_BEAT_TOLERANCE_MS,
  MAX_BEAT_GRID_POINTS,
  beatCountToCover,
  buildBeatGrid,
  nearestGridTime,
  snapClipsToGrid,
  type SnapClipInput
} from "../src/beats.js";

/** A beat every 500 ms: 0, 500, 1000, 1500, 2000, 2500. */
const GRID_120_BPM = buildBeatGrid({ bpm: 120, count: 6 });

const clip = (
  id: string,
  startMs: number,
  durationMs: number
): SnapClipInput => ({ id, startMs, durationMs });

describe("buildBeatGrid", () => {
  it("lays a 120 BPM grid every 500 ms", () => {
    expect(GRID_120_BPM).toEqual([0, 500, 1000, 1500, 2000, 2500]);
  });

  it("offsets beat one without moving the interval", () => {
    expect(buildBeatGrid({ bpm: 120, offsetMs: 120, count: 3 })).toEqual([
      120, 620, 1120
    ]);
  });

  it("does not drift on a fractional interval", () => {
    // 140 BPM is 428.571… ms. Beat 100 is 42857.14 ms; accumulating the
    // interval instead would land tens of ms away by then.
    const grid = buildBeatGrid({ bpm: 140, count: 101 });
    expect(grid[100]).toBe(42857);
  });

  it("sorts and deduplicates onsets", () => {
    expect(buildBeatGrid({ onsetsMs: [900, 100, 900, 500] })).toEqual([
      100, 500, 900
    ]);
  });

  it("rounds onsets to whole milliseconds", () => {
    // `detect_audio_events` reports seconds to 3 decimals, so ×1000 arrives
    // with a fractional tail.
    expect(buildBeatGrid({ onsetsMs: [1234.4, 2000.6] })).toEqual([1234, 2001]);
  });

  it("refuses both sources, and neither", () => {
    expect(() => buildBeatGrid({ onsetsMs: [0], bpm: 120, count: 2 })).toThrow(
      /exactly one/
    );
    expect(() => buildBeatGrid({})).toThrow(/onsets_ms/);
  });

  it("refuses a tempo with no count, a bad tempo, and an empty onset list", () => {
    expect(() => buildBeatGrid({ bpm: 120 })).toThrow(/count/);
    expect(() => buildBeatGrid({ bpm: 0, count: 4 })).toThrow(/positive/);
    expect(() => buildBeatGrid({ onsetsMs: [] })).toThrow(/empty/);
  });

  it("caps the grid so a runaway count cannot fill a document", () => {
    expect(() =>
      buildBeatGrid({ bpm: 120, count: MAX_BEAT_GRID_POINTS + 1 })
    ).toThrow(new RegExp(String(MAX_BEAT_GRID_POINTS)));
  });
});

describe("beatCountToCover", () => {
  it("reaches past the last boundary so a late clip can snap forward", () => {
    // 4000 ms at 120 BPM is beat index 8, and the count runs one past it.
    expect(beatCountToCover(120, 0, 4000)).toBe(10);
  });

  it("is at least one beat for a zero-length span", () => {
    expect(beatCountToCover(120, 0, 0)).toBe(2);
  });
});

describe("nearestGridTime", () => {
  it("takes the nearest candidate inside the tolerance", () => {
    expect(nearestGridTime(530, GRID_120_BPM, 60)).toBe(500);
    expect(nearestGridTime(960, GRID_120_BPM, 60)).toBe(1000);
  });

  it("answers null when nothing is in reach", () => {
    expect(nearestGridTime(590, GRID_120_BPM, 60)).toBeNull();
  });

  it("breaks a tie toward the earlier time", () => {
    expect(nearestGridTime(750, GRID_120_BPM, 300)).toBe(500);
  });
});

describe("snapClipsToGrid", () => {
  it("moves a clip 30 ms off the beat onto it, keeping its length", () => {
    const result = snapClipsToGrid([clip("c1", 530, 1000)], GRID_120_BPM);

    expect(result.toleranceMs).toBe(DEFAULT_BEAT_TOLERANCE_MS);
    expect(result.snapped).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.clips[0]).toEqual({
      clipId: "c1",
      snapped: true,
      before: { startMs: 530, endMs: 1530, durationMs: 1000 },
      after: { startMs: 500, endMs: 1500, durationMs: 1000 },
      delta: { startMs: -30, endMs: -30 }
    });
  });

  it("leaves a clip 90 ms off the beat where it is, and says why", () => {
    const result = snapClipsToGrid([clip("c1", 590, 1000)], GRID_120_BPM);

    expect(result.snapped).toBe(0);
    expect(result.skipped).toBe(1);
    const [only] = result.clips;
    expect(only.snapped).toBe(false);
    expect(only.after).toEqual(only.before);
    expect(only.delta).toEqual({ startMs: 0, endMs: 0 });
    expect(only.reason).toContain("90ms from the nearest beat (500ms)");
    expect(only.reason).toContain("tolerance is 60ms");
  });

  it("reports the clips that did not move alongside the ones that did", () => {
    const result = snapClipsToGrid(
      [clip("near", 530, 400), clip("far", 590, 400)],
      GRID_120_BPM
    );

    expect(result.clips.map((entry) => entry.clipId)).toEqual(["near", "far"]);
    expect(result.clips.map((entry) => entry.snapped)).toEqual([true, false]);
  });

  it("trims the end onto the beat and keeps startMs", () => {
    const result = snapClipsToGrid([clip("c1", 500, 970)], GRID_120_BPM, {
      mode: "end",
      action: "trim"
    });

    expect(result.clips[0]).toEqual({
      clipId: "c1",
      snapped: true,
      before: { startMs: 500, endMs: 1470, durationMs: 970 },
      after: { startMs: 500, endMs: 1500, durationMs: 1000 },
      delta: { startMs: 0, endMs: 30 }
    });
  });

  it("trims the start onto the beat and keeps the end", () => {
    const result = snapClipsToGrid([clip("c1", 530, 970)], GRID_120_BPM, {
      mode: "start",
      action: "trim"
    });

    expect(result.clips[0].after).toEqual({
      startMs: 500,
      endMs: 1500,
      durationMs: 1000
    });
  });

  it("moves on the end boundary by sliding the whole clip", () => {
    const result = snapClipsToGrid([clip("c1", 500, 970)], GRID_120_BPM, {
      mode: "end",
      action: "move"
    });

    expect(result.clips[0].after).toEqual({
      startMs: 530,
      endMs: 1500,
      durationMs: 970
    });
  });

  it("snaps both boundaries under `both` + trim", () => {
    const result = snapClipsToGrid([clip("c1", 470, 1060)], GRID_120_BPM, {
      mode: "both",
      action: "trim"
    });

    expect(result.clips[0].after).toEqual({
      startMs: 500,
      endMs: 1500,
      durationMs: 1000
    });
    expect(result.clips[0].delta).toEqual({ startMs: 30, endMs: -30 });
  });

  it("takes the start when `both` + move can only satisfy one boundary", () => {
    const result = snapClipsToGrid([clip("c1", 470, 1060)], GRID_120_BPM, {
      mode: "both",
      action: "move"
    });

    expect(result.clips[0].after).toEqual({
      startMs: 500,
      endMs: 1560,
      durationMs: 1060
    });
  });

  it("skips a clip already sitting on the grid rather than reporting a move", () => {
    const result = snapClipsToGrid([clip("c1", 500, 1000)], GRID_120_BPM);

    expect(result.snapped).toBe(0);
    expect(result.clips[0].reason).toBe("already on the grid");
  });

  it("refuses a trim that would leave nothing of the clip", () => {
    // The end is dragged back onto beat 500, at or before the clip's start.
    const result = snapClipsToGrid([clip("c1", 500, 30)], GRID_120_BPM, {
      mode: "end",
      action: "trim"
    });

    expect(result.clips[0].snapped).toBe(false);
    expect(result.clips[0].reason).toContain("long");
    expect(result.clips[0].after).toEqual(result.clips[0].before);
  });

  it("refuses a move that would start the clip before zero", () => {
    const result = snapClipsToGrid([clip("c1", 20, 500)], [-40], {
      toleranceMs: 100
    });

    expect(result.clips[0].snapped).toBe(false);
    expect(result.clips[0].reason).toContain("before zero");
  });

  it("skips every clip when the grid is empty", () => {
    const result = snapClipsToGrid([clip("c1", 530, 400)], []);

    expect(result.clips[0].reason).toBe("the beat grid is empty");
  });

  it("snaps to onsets the same way it snaps to a tempo", () => {
    const result = snapClipsToGrid(
      [clip("c1", 1234, 500)],
      buildBeatGrid({ onsetsMs: [1200, 4000] }),
      { toleranceMs: 60 }
    );

    expect(result.clips[0].after.startMs).toBe(1200);
  });
});
