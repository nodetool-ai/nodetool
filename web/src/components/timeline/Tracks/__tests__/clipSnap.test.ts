import type { TimelineClip, TimelineTrack } from "@nodetool-ai/timeline";
import {
  collectSnapCandidates,
  type SnapGridSpec,
  snapClipWindow,
  snapEdge,
  snapGridSpecFrom,
  SNAP_THRESHOLD_PX
} from "../clipSnap";

const clip = (
  id: string,
  startMs: number,
  durationMs: number,
  linkId?: string
): TimelineClip => ({
  id,
  trackId: "t1",
  name: id,
  startMs,
  durationMs,
  mediaType: "video",
  sourceType: "imported",
  status: "draft",
  locked: false,
  versions: [],
  linkId
});

const track = (id: string, type: TimelineTrack["type"]): TimelineTrack => ({
  id,
  name: id,
  type,
  index: 0,
  visible: true,
  locked: false
});

/** Snapping on, one midi track, the beat grid over the first four seconds. */
const grid = (overrides: Partial<SnapGridSpec> = {}): SnapGridSpec => ({
  tempo: { bpm: 120, offsetMs: 0, timeSignature: { beatsPerBar: 4, beatUnit: 4 } },
  division: "beat",
  fromMs: 0,
  toMs: 2000,
  snapEnabled: true,
  hasMidiTrack: true,
  rulerMode: "timecode",
  ...overrides
});

const MS_PER_PX = 10;
const THRESHOLD_MS = SNAP_THRESHOLD_PX * MS_PER_PX;

describe("collectSnapCandidates", () => {
  it("includes the playhead, second gridlines and other clips' edges", () => {
    const out = collectSnapCandidates(
      [clip("a", 2500, 1000), clip("b", 6200, 800)],
      3000,
      1234,
      new Set(["a"])
    );
    expect(out).toEqual([0, 1000, 1234, 2000, 3000, 4000, 6200, 7000]);
  });

  it("adds the tempo grid when the document has a midi track", () => {
    const out = collectSnapCandidates([], 0, 0, new Set(), grid());
    // 120 BPM: a beat every 500 ms. 0, 1000 and 2000 are already second ticks.
    expect(out).toContain(500);
    expect(out).toContain(1500);
  });

  it("adds it for a picture-only sequence read in bars", () => {
    const out = collectSnapCandidates(
      [],
      0,
      0,
      new Set(),
      grid({ hasMidiTrack: false, rulerMode: "bars" })
    );
    expect(out).toContain(500);
  });

  it("leaves a picture-only sequence in timecode with the candidates it had", () => {
    const base = collectSnapCandidates([], 0, 0, new Set());
    const out = collectSnapCandidates(
      [],
      0,
      0,
      new Set(),
      grid({ hasMidiTrack: false })
    );
    expect(out).toEqual(base);
  });

  it("offers no grid while the magnet is off", () => {
    const out = collectSnapCandidates(
      [],
      0,
      0,
      new Set(),
      grid({ snapEnabled: false })
    );
    expect(out).not.toContain(500);
  });

  it("stops the grid at the end of the visible range", () => {
    const out = collectSnapCandidates(
      [],
      0,
      0,
      new Set(),
      grid({ fromMs: 0, toMs: 1000 })
    );
    expect(out).toContain(500);
    expect(out).not.toContain(1500);
  });

  it("drops the linked siblings of an excluded clip", () => {
    const out = collectSnapCandidates(
      [clip("v", 2500, 1000, "L"), clip("a", 2500, 1000, "L"), clip("x", 6200, 100)],
      0,
      0,
      new Set(["v"])
    );
    expect(out).not.toContain(2500);
    expect(out).not.toContain(3500);
    expect(out).toContain(6200);
  });
});

describe("snapGridSpecFrom", () => {
  const ui = {
    snapEnabled: true,
    rulerMode: "timecode" as const,
    gridDivision: "beat" as const,
    msPerPx: 10,
    scrollLeftPx: 100,
    lanesViewportWidthPx: 800
  };

  it("covers the visible range and nothing beyond it", () => {
    const spec = snapGridSpecFrom({ tracks: [track("t1", "midi")] }, ui);
    expect(spec.fromMs).toBe(1000);
    expect(spec.toMs).toBe(9000);
    expect(spec.hasMidiTrack).toBe(true);
  });

  it("reads the default tempo on a document that stores none", () => {
    const spec = snapGridSpecFrom({ tracks: [] }, ui);
    expect(spec.tempo.bpm).toBe(120);
    expect(spec.hasMidiTrack).toBe(false);
  });

  it("falls back to a viewport width before the lanes are measured", () => {
    const spec = snapGridSpecFrom(
      { tracks: [] },
      { ...ui, scrollLeftPx: 0, lanesViewportWidthPx: 0 }
    );
    expect(spec.toMs).toBeGreaterThan(0);
  });
});

describe("snapEdge", () => {
  it("locks onto a candidate inside the threshold", () => {
    expect(snapEdge(4150, [4200], MS_PER_PX)).toEqual({ valueMs: 4200, guideMs: 4200 });
  });

  it("leaves the edge alone outside the threshold", () => {
    expect(snapEdge(4000, [4000 + THRESHOLD_MS + 1], MS_PER_PX)).toEqual({
      valueMs: 4000,
      guideMs: null
    });
  });
});

describe("snapClipWindow", () => {
  it("prefers the start edge when it is the closer hit", () => {
    // start 1050 is 50 from 1000; end 2050 is 70 from 2120.
    expect(snapClipWindow(1050, 1000, [1000, 2120], MS_PER_PX)).toEqual({
      startMs: 1000,
      guideMs: 1000
    });
  });

  it("shifts the start so the end lands when the end edge is closer", () => {
    // start 1070 is 70 from 1000; end 2070 is 30 from 2100.
    expect(snapClipWindow(1070, 1000, [1000, 2100], MS_PER_PX)).toEqual({
      startMs: 1100,
      guideMs: 2100
    });
  });

  it("returns the raw start with no guide when neither edge hits", () => {
    expect(snapClipWindow(1500, 1000, [1000, 3000], MS_PER_PX)).toEqual({
      startMs: 1500,
      guideMs: null
    });
  });
});
