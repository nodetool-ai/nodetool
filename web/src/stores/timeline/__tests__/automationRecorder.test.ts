/**
 * Recording passes (AU7): Touch, Latch and Write against a real transport
 * store and a real document store. The audio graph is a recording sink.
 */
import { describe, it, expect, beforeEach } from "@jest/globals";
import { makeTrack, type AutomationMode } from "@nodetool-ai/timeline";

import { createTimelineStore, timelineTemporalOf } from "../TimelineStore";
import { createTimelinePlaybackStore } from "../TimelinePlaybackStore";
import { AutomationRecorder } from "../automationRecorder";

const overrides: Array<[string, string, number | null]> = [];
const sink = {
  setMixerOverride: (trackId: string, param: string, value: number | null) => {
    overrides.push([trackId, param, value]);
  }
};

function setup(mode: AutomationMode, extra: { volumeDb?: number } = {}) {
  const doc = createTimelineStore();
  const playback = createTimelinePlaybackStore();
  const track = makeTrack({ type: "audio", name: "A", automationMode: mode, ...extra });
  doc.setState({ tracks: [track], clips: [] });
  timelineTemporalOf(doc).clear();
  const recorder = new AutomationRecorder(doc, playback, () => sink);
  const at = (ms: number) => playback.getState().setTimeMs(ms);
  const lane = (param: "volumeDb" | "pan") =>
    doc
      .getState()
      .tracks[0].automation?.find((l) => l.target.kind === "mixer" && l.target.param === param)
      ?.points;
  return { doc, playback, recorder, track, at, lane };
}

beforeEach(() => {
  overrides.length = 0;
});

describe("Touch", () => {
  it("records from press to release, keeps the track value and is one undo step", () => {
    const { doc, playback, recorder, track, at, lane } = setup("touch");
    playback.getState().play();
    at(1000);
    recorder.gestureStart(track.id, "volumeDb", 0);
    expect(recorder.liveValue(track.id, "volumeDb")).toBe(0);
    at(1200);
    expect(recorder.record(track.id, "volumeDb", -6)).toBe(true);
    expect(recorder.liveValue(track.id, "volumeDb")).toBe(-6);
    at(1400);
    recorder.record(track.id, "volumeDb", -6);
    at(1500);
    recorder.gestureEnd(track.id, "volumeDb");
    expect(lane("volumeDb")).toEqual([
      { timeMs: 1000, value: 0 },
      { timeMs: 1200, value: -6 },
      { timeMs: 1500, value: -6 },
      { timeMs: 1700, value: 0 }
    ]);
    expect(doc.getState().tracks[0].volumeDb).toBeUndefined();
    expect(doc.getState().tracks[0].automationMode).toBe("touch");
    expect(timelineTemporalOf(doc).pastStates).toHaveLength(1);
    expect(recorder.liveValue(track.id, "volumeDb")).toBeUndefined();
    expect(overrides[0]).toEqual([track.id, "volumeDb", 0]);
    expect(overrides[overrides.length - 1]).toEqual([track.id, "volumeDb", null]);
  });

  it("ends the pass when the transport stops, at the time before the stop", () => {
    const { playback, recorder, track, at, lane } = setup("touch");
    playback.getState().play();
    at(1000);
    recorder.gestureStart(track.id, "pan", 0);
    at(1600);
    recorder.record(track.id, "pan", 0.5);
    at(2000);
    playback.getState().stop();
    expect(lane("pan")).toEqual([
      { timeMs: 1000, value: 0 },
      { timeMs: 1600, value: 0.5 },
      { timeMs: 2000, value: 0.5 },
      { timeMs: 2200, value: 0 }
    ]);
  });

  it("does not record while stopped or without a press", () => {
    const { playback, recorder, track, at, lane } = setup("touch");
    at(1000);
    recorder.gestureStart(track.id, "volumeDb", 0);
    expect(recorder.record(track.id, "volumeDb", -6)).toBe(false);
    playback.getState().play();
    expect(recorder.record(track.id, "volumeDb", -6)).toBe(false);
    expect(lane("volumeDb")).toBeUndefined();
  });
});

describe("Read and Off", () => {
  it.each(["read", "off"] as const)("%s never records", (mode) => {
    const { playback, recorder, track, at } = setup(mode);
    playback.getState().play();
    at(1000);
    recorder.gestureStart(track.id, "volumeDb", 0);
    expect(recorder.record(track.id, "volumeDb", -6)).toBe(false);
    expect(recorder.recording).toBe(false);
  });
});

describe("Latch", () => {
  it("keeps recording after release until the transport stops", () => {
    const { doc, playback, recorder, track, at, lane } = setup("latch");
    playback.getState().play();
    at(1000);
    recorder.gestureStart(track.id, "volumeDb", 0);
    at(1100);
    recorder.record(track.id, "volumeDb", -9);
    at(1200);
    recorder.gestureEnd(track.id, "volumeDb");
    expect(lane("volumeDb")).toBeUndefined();
    expect(recorder.liveValue(track.id, "volumeDb")).toBe(-9);
    at(3000);
    playback.getState().pause();
    expect(lane("volumeDb")).toEqual([
      { timeMs: 1000, value: 0 },
      { timeMs: 1100, value: -9 },
      { timeMs: 3000, value: -9 },
      { timeMs: 3200, value: 0 }
    ]);
    expect(timelineTemporalOf(doc).pastStates).toHaveLength(1);
  });

  it("ends at the time before a seek", () => {
    const { playback, recorder, track, at, lane } = setup("latch");
    playback.getState().play();
    at(1000);
    recorder.gestureStart(track.id, "volumeDb", -3);
    at(1500);
    playback.getState().seek(0);
    expect(lane("volumeDb")).toEqual([
      { timeMs: 1000, value: -3 },
      { timeMs: 1500, value: -3 },
      { timeMs: 1700, value: 0 }
    ]);
  });
});

describe("Write", () => {
  it("records volume and pan from play to stop, then switches to Latch in one undo step", () => {
    const { doc, playback, recorder, track, at, lane } = setup("write", { volumeDb: -2 });
    playback.getState().play();
    expect(recorder.recording).toBe(true);
    at(800);
    recorder.record(track.id, "volumeDb", -8);
    at(1000);
    playback.getState().pause();
    expect(lane("volumeDb")).toEqual([
      { timeMs: 0, value: -2 },
      { timeMs: 800, value: -8 },
      { timeMs: 1000, value: -8 },
      { timeMs: 1200, value: -2 }
    ]);
    expect(lane("pan")).toEqual([
      { timeMs: 0, value: 0 },
      { timeMs: 1000, value: 0 },
      { timeMs: 1200, value: 0 }
    ]);
    expect(doc.getState().tracks[0].automationMode).toBe("latch");
    expect(doc.getState().tracks[0].volumeDb).toBe(-2);
    expect(timelineTemporalOf(doc).pastStates).toHaveLength(1);
    timelineTemporalOf(doc).undo();
    expect(doc.getState().tracks[0].automation).toBeUndefined();
    expect(doc.getState().tracks[0].automationMode).toBe("write");
  });

  it("writes into an existing lane and returns to its old curve", () => {
    const { doc, playback, track, at, lane, recorder } = setup("write");
    doc.getState().setTrackAutomation(track.id, [
      {
        id: "l",
        target: { kind: "mixer", param: "volumeDb" },
        points: [
          { timeMs: 0, value: -3 },
          { timeMs: 4000, value: -3 }
        ]
      }
    ]);
    playback.getState().seek(1000);
    playback.getState().play();
    at(1500);
    recorder.record(track.id, "volumeDb", -10);
    at(2000);
    playback.getState().pause();
    expect(lane("volumeDb")).toEqual([
      { timeMs: 0, value: -3 },
      { timeMs: 1000, value: 0 },
      { timeMs: 1500, value: -10 },
      { timeMs: 2000, value: -10 },
      { timeMs: 2200, value: -3 },
      { timeMs: 4000, value: -3 }
    ]);
  });
});

describe("document changes (F2)", () => {
  it("keeps a mode the user picks during a Write pass", () => {
    const { doc, playback, recorder, track, at, lane } = setup("write");
    playback.getState().play();
    at(1000);
    doc.getState().setTrackAutomationMode(track.id, "off");
    expect(recorder.recording).toBe(false);
    expect(overrides.filter((o) => o[2] === null)).toHaveLength(2);
    at(1500);
    playback.getState().pause();
    expect(doc.getState().tracks[0].automationMode).toBe("off");
    expect(lane("volumeDb")).toBeDefined();
  });

  it("cancels a pass of a deleted or locked track and releases its override", () => {
    const { doc, playback, recorder, track, at } = setup("latch");
    playback.getState().play();
    at(1000);
    recorder.gestureStart(track.id, "volumeDb", 0);
    doc.getState().setTrackLocked(track.id, true);
    expect(recorder.recording).toBe(false);
    expect(overrides[overrides.length - 1]).toEqual([track.id, "volumeDb", null]);
    expect(doc.getState().tracks[0].automation).toBeUndefined();
  });

  it("releases overrides on dispose and can attach again", () => {
    const { playback, recorder, track, at } = setup("latch");
    playback.getState().play();
    at(1000);
    recorder.gestureStart(track.id, "pan", 0);
    recorder.dispose();
    expect(recorder.recording).toBe(false);
    expect(overrides[overrides.length - 1]).toEqual([track.id, "pan", null]);
    recorder.attach();
    recorder.gestureStart(track.id, "pan", 0);
    expect(recorder.recording).toBe(true);
    recorder.dispose();
  });
});

describe("samples (F5, F17, F15)", () => {
  it("coalesces samples at the same time", () => {
    const { playback, recorder, track, at, lane } = setup("touch");
    playback.getState().play();
    at(1000);
    recorder.gestureStart(track.id, "volumeDb", 0);
    recorder.record(track.id, "volumeDb", -6);
    at(1100);
    recorder.gestureEnd(track.id, "volumeDb");
    expect(lane("volumeDb")).toEqual([
      { timeMs: 1000, value: -6 },
      { timeMs: 1100, value: -6 },
      { timeMs: 1300, value: 0 }
    ]);
  });

  it("writes no duplicate times for a reverse pass", () => {
    const { playback, recorder, track, at, lane } = setup("latch");
    playback.getState().setRate(-1);
    playback.getState().play();
    at(2000);
    recorder.gestureStart(track.id, "volumeDb", 0);
    at(1500);
    recorder.record(track.id, "volumeDb", -6);
    at(1000);
    playback.getState().pause();
    const times = lane("volumeDb")!.map((p) => p.timeMs);
    expect(new Set(times).size).toBe(times.length);
    expect(times[0]).toBe(1000);
  });

  it("clamps to the lane range", () => {
    const { playback, recorder, track, at } = setup("latch");
    playback.getState().play();
    at(1000);
    recorder.gestureStart(track.id, "volumeDb", 0);
    recorder.record(track.id, "volumeDb", -120);
    expect(recorder.liveValue(track.id, "volumeDb")).toBe(-60);
  });

  it("opens a Touch pass at the lane value, not the track value", () => {
    const { doc, playback, recorder, track, at } = setup("touch");
    doc.getState().setTrackAutomation(track.id, [
      {
        id: "l",
        target: { kind: "mixer", param: "volumeDb" },
        points: [
          { timeMs: 0, value: -18 },
          { timeMs: 4000, value: -18 }
        ]
      }
    ]);
    playback.getState().play();
    at(2000);
    recorder.gestureStart(track.id, "volumeDb", 0);
    expect(recorder.liveValue(track.id, "volumeDb")).toBe(-18);
  });

  it("commit records a typed value as a pass", () => {
    const { playback, recorder, track, at, lane } = setup("touch");
    playback.getState().play();
    at(1000);
    expect(recorder.commit(track.id, "volumeDb", -6)).toBe(true);
    expect(lane("volumeDb")![0]).toEqual({ timeMs: 1000, value: -6 });
    playback.getState().pause();
    expect(recorder.commit(track.id, "volumeDb", -6)).toBe(false);
  });
});

describe("transport jumps (F8, F9)", () => {
  it("does not end Write passes when play and a same-time seek come in one turn", () => {
    const { playback, recorder, at } = setup("write");
    at(1000);
    playback.getState().play();
    playback.getState().seek(1000);
    expect(recorder.recording).toBe(true);
  });

  it("restarts Write passes at the new time for play followed by another seek", () => {
    const { doc, playback, recorder, at } = setup("write");
    at(1000);
    playback.getState().play();
    playback.getState().seek(3000);
    expect(recorder.recording).toBe(true);
    expect(doc.getState().tracks[0].automationMode).toBe("write");
    expect(doc.getState().tracks[0].automation).toBeUndefined();
  });

  it("ends a pass at the time before a playhead drag", () => {
    const { playback, recorder, track, at, lane } = setup("latch");
    playback.getState().play();
    at(2000);
    recorder.gestureStart(track.id, "volumeDb", -3);
    playback.getState().setCurrentTimeMs(4000);
    playback.getState().setCurrentTimeMs(5000);
    expect(recorder.recording).toBe(false);
    expect(lane("volumeDb")).toEqual([
      { timeMs: 2000, value: -3 },
      { timeMs: 2200, value: 0 }
    ]);
  });

  it("ends a reverse pass at 0 when playback reaches the start", () => {
    const { playback, recorder, track, at, lane } = setup("latch");
    playback.getState().setRate(-1);
    playback.getState().play();
    at(500);
    recorder.gestureStart(track.id, "volumeDb", -3);
    at(30);
    playback.getState().setCurrentTimeMs(0);
    playback.getState().setTimeMs(0);
    playback.getState().pause();
    expect(lane("volumeDb")![0].timeMs).toBe(0);
  });
});
