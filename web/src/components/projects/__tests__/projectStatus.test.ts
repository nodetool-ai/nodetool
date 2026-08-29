/**
 * What a project card says, derived from its documents. The rule under test is
 * that only recorded facts are stated: a cut reports its size, never that it
 * has been delivered, and unpriced calls are named rather than summed as zero.
 */

import {
  formatDuration,
  formatSpend,
  projectProgress,
  projectStatusLine,
  type ProjectDetail,
  type ProjectDocument
} from "../projectStatus";

const document = (over: Partial<ProjectDocument>): ProjectDocument => ({
  type: "storyboard",
  ref: "d1",
  name: "Board",
  updatedAt: "2026-08-29T00:00:00.000Z",
  status: null,
  spendUsd: 0,
  unpricedCount: 0,
  thumbnails: [],
  ...over
});

const spend = (over: Partial<ProjectDetail["spend"]>): ProjectDetail["spend"] => ({
  totalUsd: 0,
  unpricedCount: 0,
  byCategory: [],
  ...over
});

describe("formatDuration", () => {
  it("reads milliseconds as m:ss", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(102_000)).toBe("1:42");
    expect(formatDuration(9_000)).toBe("0:09");
  });
});

describe("projectStatusLine", () => {
  it("says so when there is nothing in the project", () => {
    expect(projectStatusLine([])).toBe("No documents yet");
  });

  it("reads a board, a script and a cut into one line", () => {
    expect(
      projectStatusLine([
        document({
          status: { kind: "storyboard", shots: 8, stills: 8, clips: 6 }
        }),
        document({
          type: "script",
          ref: "s1",
          status: { kind: "script", lines: 12, voiced: 10, stale: 2 }
        }),
        document({
          type: "timeline",
          ref: "t1",
          status: { kind: "timeline", clips: 6, durationMs: 102_000 }
        })
      ])
    ).toBe("8 shots · stills 8/8 · voiced 10/12 · 2 stale · cut 6 clips · 1:42");
  });

  it("counts documents that derive no status", () => {
    expect(
      projectStatusLine([
        document({ type: "sketch", ref: "k1" }),
        document({ type: "application", ref: "a1" })
      ])
    ).toBe("2 documents");
  });
});

describe("projectProgress", () => {
  it("reports the board's clips, and calls it done only when every shot has one", () => {
    expect(
      projectProgress([
        document({ status: { kind: "storyboard", shots: 8, stills: 8, clips: 6 } })
      ])
    ).toEqual({ label: "clips 6/8", done: false });
    expect(
      projectProgress([
        document({ status: { kind: "storyboard", shots: 8, stills: 8, clips: 8 } })
      ])
    ).toEqual({ label: "clips 8/8", done: true });
  });

  it("falls back to the cut's length, and never claims it was rendered", () => {
    expect(
      projectProgress([
        document({
          type: "timeline",
          ref: "t1",
          status: { kind: "timeline", clips: 6, durationMs: 102_000 }
        })
      ])
    ).toEqual({ label: "cut · 1:42", done: false });
  });

  it("has nothing to say about a project with neither", () => {
    expect(projectProgress([document({ type: "sketch", ref: "k1" })])).toBeNull();
  });
});

describe("formatSpend", () => {
  it("names what no catalog priced instead of dropping it", () => {
    expect(formatSpend(spend({ totalUsd: 4.115 }))).toBe("$4.12");
    expect(formatSpend(spend({ totalUsd: 4.12, unpricedCount: 2 }))).toBe(
      "$4.12 · 2 unpriced"
    );
  });
});
