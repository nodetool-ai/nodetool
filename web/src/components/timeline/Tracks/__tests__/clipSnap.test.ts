import type { TimelineClip } from "@nodetool-ai/timeline";
import {
  collectSnapCandidates,
  snapClipWindow,
  snapEdge,
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
