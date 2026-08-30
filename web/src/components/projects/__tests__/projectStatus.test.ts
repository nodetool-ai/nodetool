/**
 * What a project card says, derived from its documents. The rule under test is
 * that only recorded facts are stated: a cut reports its size, never that it
 * has been delivered, and unpriced calls are named rather than summed as zero.
 */

import {
  documentProgress,
  documentStatusLine,
  formatDocumentSpend,
  formatDuration,
  formatSpend,
  projectNextStep,
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
  preview: null,
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

  it("marks the line when the document table it was read from was capped", () => {
    expect(
      projectStatusLine(
        [
          document({
            status: { kind: "storyboard", shots: 8, stills: 8, clips: 6 }
          })
        ],
        { documentsPartial: true }
      )
    ).toBe("8 shots · stills 8/8 · partial");
    expect(
      projectStatusLine(
        [document({ type: "sketch", ref: "k1" })],
        { documentsPartial: true }
      )
    ).toBe("1 document · partial");
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

  it("marks a capped ledger read as a lower bound instead of a final figure", () => {
    expect(formatSpend(spend({ totalUsd: 4.12, partial: true }))).toBe(
      "≥$4.12"
    );
    expect(
      formatSpend(spend({ totalUsd: 4.12, unpricedCount: 2, partial: true }))
    ).toBe("≥$4.12 · 2 unpriced");
  });
});

const board = (stills: number, clips: number, shots = 8): ProjectDocument =>
  document({ status: { kind: "storyboard", shots, stills, clips } });

const script = (voiced: number, stale: number, lines = 6): ProjectDocument =>
  document({
    type: "script",
    ref: "s1",
    name: "Script",
    status: { kind: "script", lines, voiced, stale }
  });

const cut = (durationMs: number, clips = 9): ProjectDocument =>
  document({
    type: "timeline",
    ref: "t1",
    name: "Cut",
    status: { kind: "timeline", clips, durationMs }
  });

describe("documentStatusLine", () => {
  it("speaks for one document rather than collapsing a kind", () => {
    expect(documentStatusLine(board(8, 6))).toBe("8 shots · stills 8/8");
    expect(documentStatusLine(script(5, 1))).toBe("6 lines · 5 voiced");
    expect(documentStatusLine(cut(30_000))).toBe("9 clips · 0:30");
  });

  it("says nothing for a kind whose status is not derived", () => {
    expect(documentStatusLine(document({ type: "sketch", ref: "k1" }))).toBe("");
  });
});

describe("documentProgress", () => {
  it("calls a board done only when every shot has a clip", () => {
    expect(documentProgress(board(8, 6))).toEqual({
      label: "clips 6/8",
      tone: "neutral"
    });
    expect(documentProgress(board(8, 8))).toEqual({
      label: "clips 8/8",
      tone: "done"
    });
  });

  it("leads with a script's drift, and calls it voiced only with none", () => {
    expect(documentProgress(script(5, 1))).toEqual({
      label: "1 line stale",
      tone: "neutral"
    });
    expect(documentProgress(script(6, 0))).toEqual({
      label: "voiced",
      tone: "done"
    });
  });

  it("reports a cut's length, never that it was rendered", () => {
    expect(documentProgress(cut(102_000))).toEqual({
      label: "1:42",
      tone: "neutral"
    });
  });
});

describe("formatDocumentSpend", () => {
  it("names a document's unpriced calls rather than summing them as zero", () => {
    expect(formatDocumentSpend(document({ spendUsd: 3.884 }))).toBe("$3.88");
    expect(
      formatDocumentSpend(document({ spendUsd: 3.88, unpricedCount: 1 }))
    ).toBe("$3.88 · 1 unpriced");
  });
});

describe("projectNextStep", () => {
  it("walks the order a spot is made", () => {
    expect(projectNextStep([board(4, 0)])?.label).toBe("Render stills");
    expect(projectNextStep([board(8, 6)])?.label).toBe("Render clips");
    expect(projectNextStep([board(8, 8)])?.label).toBe("Assemble timeline");
    expect(projectNextStep([board(8, 8), cut(30_000)])?.label).toBe(
      "Render master"
    );
  });

  it("puts a drifted script ahead of the cut it would be laid into", () => {
    const step = projectNextStep([board(8, 8), script(5, 1), cut(30_000)]);
    expect(step?.label).toBe("Re-voice 1 line");
    expect(step?.document.ref).toBe("s1");
  });

  it("offers to voice a never-voiced script instead of jumping to assemble", () => {
    const step = projectNextStep([board(8, 8), script(0, 0)]);
    expect(step?.label).toBe("Voice 6 lines");
    expect(step?.document.ref).toBe("s1");
  });

  it("offers to voice a never-voiced script ahead of the cut it feeds", () => {
    const step = projectNextStep([board(8, 8), script(0, 0), cut(30_000)]);
    expect(step?.label).toBe("Voice 6 lines");
    expect(step?.document.ref).toBe("s1");
  });

  it("says nothing more once every line is voiced", () => {
    expect(projectNextStep([board(8, 8), script(6, 0)])?.label).toBe(
      "Assemble timeline"
    );
  });

  it("names the document that performs the step", () => {
    expect(projectNextStep([board(8, 6)])?.document.ref).toBe("d1");
  });

  it("has no step for an empty project or an empty board", () => {
    expect(projectNextStep([])).toBeNull();
    expect(projectNextStep([board(0, 0, 0)])).toBeNull();
  });
});
