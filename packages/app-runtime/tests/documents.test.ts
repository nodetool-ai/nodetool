import { describe, expect, it } from "vitest";

import {
  formatDuration,
  readSketchBinding,
  readTimelineBinding,
  sketchSummary,
  timelineSummary
} from "../src/documents.js";

const SKETCH = {
  version: 1,
  canvas: { width: 1024, height: 768, backgroundColor: "#fff" },
  layers: [{ id: "l1" }, { id: "l2" }],
  activeLayerId: "l1"
};

const TIMELINE = {
  id: "seq-1",
  name: "Trailer",
  fps: 30,
  width: 1920,
  height: 1080,
  durationMs: 92_000,
  tracks: [{ id: "t1" }, { id: "t2" }],
  clips: [{ id: "c1" }, { id: "c2" }, { id: "c3" }],
  markers: []
};

describe("readSketchBinding", () => {
  it("unwraps the envelopes a sketch arrives in", () => {
    for (const value of [
      SKETCH,
      { document: SKETCH },
      { sketch: SKETCH },
      { type: "sketch", data: SKETCH }
    ]) {
      expect(readSketchBinding(value).document).toEqual(SKETCH);
    }
  });

  it("takes the last item of an accumulated streamed output", () => {
    const older = { ...SKETCH, canvas: { ...SKETCH.canvas, width: 512 } };
    expect(readSketchBinding([older, SKETCH]).document).toEqual(SKETCH);
  });

  it("reports the id of a ref that carries no inline document", () => {
    expect(readSketchBinding({ type: "sketch", id: "img-1" })).toEqual({
      document: null,
      id: "img-1"
    });
  });

  it("reports neither for a value that is not a sketch", () => {
    expect(readSketchBinding("hello")).toEqual({ document: null, id: null });
    expect(readSketchBinding({ id: "" })).toEqual({ document: null, id: null });
  });

  it("stops unwrapping a self-referential value instead of recursing forever", () => {
    const loop: Record<string, unknown> = {};
    loop.document = loop;
    expect(() => readSketchBinding(loop)).not.toThrow();
    expect(readSketchBinding(loop).document).toBeNull();
  });
});

describe("readTimelineBinding", () => {
  it("unwraps the envelopes a timeline arrives in", () => {
    for (const value of [
      TIMELINE,
      { sequence: TIMELINE },
      { document: TIMELINE },
      { type: "timeline", data: TIMELINE }
    ]) {
      expect(readTimelineBinding(value).document).toEqual(TIMELINE);
    }
  });

  it("reports the id of a ref that carries no inline sequence", () => {
    expect(readTimelineBinding({ type: "timeline", id: "seq-9" })).toEqual({
      document: null,
      id: "seq-9"
    });
  });
});

describe("summaries", () => {
  it("describes a sketch by canvas size and layer count", () => {
    expect(sketchSummary(SKETCH)).toEqual({
      width: 1024,
      height: 768,
      layerCount: 2
    });
  });

  it("describes a timeline by name, duration, tracks and clips", () => {
    expect(timelineSummary(TIMELINE)).toEqual({
      name: "Trailer",
      durationMs: 92_000,
      trackCount: 2,
      clipCount: 3
    });
  });

  it("returns null for a value of the wrong shape", () => {
    expect(sketchSummary(TIMELINE)).toBeNull();
    expect(timelineSummary(SKETCH)).toBeNull();
    expect(sketchSummary(null)).toBeNull();
  });
});

describe("formatDuration", () => {
  it("renders m:ss, padding the seconds and clamping negatives", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(9_000)).toBe("0:09");
    expect(formatDuration(92_000)).toBe("1:32");
    expect(formatDuration(-5)).toBe("0:00");
  });
});
