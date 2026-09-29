/**
 * `text_illegible` (F24, R5): type too small to read at delivery size, and type
 * too close in colour to what is behind it.
 *
 * The pairs are on the boundary — 27px against 26px in a 1080p frame, 3.03:1
 * against 2.85:1 — and the second half of the file is the other invariant this
 * check has to hold: it says nothing when it cannot prove what is behind the
 * text. A legibility warning naming a plate the title does not actually sit on
 * is worse than no warning, because the next edit is made against it.
 */
import { describe, expect, it } from "vitest";

import { validateTimelineSequence } from "../src/timeline-debug/index.js";

type Json = Record<string, unknown>;

const HD = { fps: 30, width: 1920, height: 1080 };

const base = (over: Json): Json => ({
  id: "clip-1",
  trackId: "titles",
  name: "Title",
  startMs: 1000,
  durationMs: 2000,
  sourceType: "imported",
  status: "generated",
  locked: false,
  versions: [],
  ...over
});

const title = (style: Json, over: Json = {}): Json =>
  base({
    mediaType: "text",
    textStyle: { text: "First Light", fontSizePx: 96, color: "#ffffff", ...style },
    ...over
  });

/** A full-frame rect on a lower track, i.e. drawn beneath the title. */
const plate = (fill: Json, over: Json = {}): Json =>
  base({
    id: "plate",
    trackId: "scrim",
    name: "Scrim",
    mediaType: "shape",
    startMs: 0,
    durationMs: 4000,
    shapeStyle: { kind: "rect", x: 0, y: 0, width: 1, height: 1, ...fill },
    ...over
  });

const doc = (clips: Json[]): Json => ({
  tracks: [
    {
      id: "titles",
      name: "Titles",
      type: "overlay",
      index: 0,
      visible: true,
      locked: false
    },
    {
      id: "scrim",
      name: "Scrim",
      type: "video",
      index: 1,
      visible: true,
      locked: false
    }
  ],
  clips,
  markers: []
});

const illegible = (result: { warnings: { code: string; message: string }[] }) =>
  result.warnings.filter((issue) => issue.code === "text_illegible");

describe("validateTimelineSequence — text size", () => {
  it("accepts type at exactly 2.5% of frame height", () => {
    const result = validateTimelineSequence(
      doc([title({ fontSizePx: 27 })]),
      HD
    );
    expect(illegible(result)).toEqual([]);
  });

  it("warns one pixel under the floor", () => {
    const result = validateTimelineSequence(
      doc([title({ fontSizePx: 26 })]),
      HD
    );
    const found = illegible(result);
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("26px");
    expect(result.ok).toBe(true);
  });

  it("scales the floor with the frame, not with the number", () => {
    const uhd = validateTimelineSequence(doc([title({ fontSizePx: 40 })]), {
      ...HD,
      width: 3840,
      height: 2160
    });
    expect(illegible(uhd)).toHaveLength(1);
    expect(illegible(validateTimelineSequence(doc([title({ fontSizePx: 40 })]), HD))).toEqual([]);
  });

  it("says nothing about a hidden clip", () => {
    const result = validateTimelineSequence(
      doc([title({ fontSizePx: 8 }, { hidden: true })]),
      HD
    );
    expect(illegible(result)).toEqual([]);
  });
});

describe("validateTimelineSequence — text contrast", () => {
  it("accepts white on a plate just over 3:1", () => {
    // #777 against white is 4.48:1.
    const result = validateTimelineSequence(
      doc([title({ background: { color: "#777777", paddingPx: 12 } })]),
      HD
    );
    expect(illegible(result)).toEqual([]);
  });

  it("warns on white type over its own light plate", () => {
    const result = validateTimelineSequence(
      doc([title({ background: { color: "#aaaaaa", paddingPx: 12 } })]),
      HD
    );
    const found = illegible(result);
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("background plate");
    expect(found[0]?.message).toContain(":1");
  });

  it("reads a full-frame shape clip beneath the title as the backdrop", () => {
    const result = validateTimelineSequence(
      doc([title({ color: "#cccccc" }), plate({ fill: "#ffffff" })]),
      HD
    );
    const found = illegible(result);
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("shape clip behind it");
  });

  it("reads a small pill plate that contains the title as the backdrop, not the scene's unrelated full-frame shape", () => {
    // The prism pattern this was written for: "4 COLOURWAYS"/"PRE-ORDER NOW"
    // sit on a small bright pill directly behind them, not a full-frame
    // scrim. A generously sized but still partial plate, centered under the
    // default-positioned title, resolvedly contains its box.
    const pill = plate(
      { fill: "#ffffff" },
      { id: "pill", name: "Pill", shapeStyle: { kind: "rect", x: 0.25, y: 0.35, width: 0.5, height: 0.3, fill: "#ffffff" } }
    );
    // An unrelated full-frame shape further back (higher index still, so
    // still "behind", but not the topmost qualifying backdrop) with a
    // colour that would give a *passing* contrast — proves the check reads
    // the pill, not this.
    const farBackdrop = plate(
      { fill: "#111111" },
      { id: "far", name: "Far", trackId: "far", startMs: 0, durationMs: 4000 }
    );
    const result = validateTimelineSequence(
      {
        tracks: [
          { id: "titles", name: "Titles", type: "overlay", index: 0, visible: true, locked: false },
          { id: "scrim", name: "Scrim", type: "video", index: 1, visible: true, locked: false },
          { id: "far", name: "Far", type: "video", index: 2, visible: true, locked: false }
        ],
        clips: [title({ color: "#cccccc" }), pill, farBackdrop],
        markers: []
      },
      HD
    );
    const found = illegible(result);
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("#ffffff");
    expect(found[0]?.message).toContain("shape clip behind it");
  });

  it("does not read a small pill plate as backing when the title does not sit fully on it", () => {
    const pill = plate(
      { fill: "#ffffff" },
      { id: "pill", name: "Pill", shapeStyle: { kind: "rect", x: 0.02, y: 0.02, width: 0.2, height: 0.08, fill: "#ffffff" } }
    );
    const result = validateTimelineSequence(
      doc([title({ color: "#cccccc" }), pill]),
      HD
    );
    expect(illegible(result)).toEqual([]);
  });

  it("reads a flex-resized plate by its resolved box, not its tiny authored one", () => {
    // The kite pattern: a flex container's absolute inset:0 child (a plate
    // behind a title) is stretched to fill the container by the flex
    // resolver — its rendered box has nothing to do with the small x/y/width/
    // height it happens to be authored with. `frameBoxFor` used to measure
    // only the authored box, so a plate like this one (tiny on paper, large
    // once resolved) never passed the containment check and the backdrop
    // check skipped straight past it to an unrelated backdrop further back.
    const container = base({
      id: "flexRoot",
      trackId: "scrim",
      name: "Container",
      mediaType: "group",
      shapeStyle: undefined,
      startMs: 0,
      durationMs: 4000,
      // Centered by the default transform (anchor 0.5,0.5, no position
      // offset) — the same box the pill tests above use.
      layout: { display: "flex", width: 960, height: 324 }
    });
    const ctaPlate = base({
      id: "plate",
      trackId: "scrim",
      parentId: "flexRoot",
      name: "Plate",
      mediaType: "shape",
      startMs: 0,
      durationMs: 4000,
      // Authored tiny and off in a corner of the container — if this box
      // were read as-is, it could not possibly contain the title.
      shapeStyle: { kind: "rect", x: 0.48, y: 0.49, width: 0.02, height: 0.01, fill: "#0f3b2e" },
      flexItem: { position: "absolute", inset: 0 }
    });
    // A full-frame shape further back, coloured so picking it *instead* of
    // the plate would read as passing contrast — proves the check reads the
    // (correctly resolved) plate, not this.
    const farBackdrop = plate({ fill: "#ffffff" }, { id: "far", name: "Far", trackId: "far", startMs: 0, durationMs: 4000 });
    const result = validateTimelineSequence(
      {
        tracks: [
          { id: "titles", name: "Titles", type: "overlay", index: 0, visible: true, locked: false },
          { id: "scrim", name: "Scrim", type: "video", index: 1, visible: true, locked: false },
          { id: "far", name: "Far", type: "video", index: 2, visible: true, locked: false }
        ],
        clips: [title({ color: "#0f3b2e" }), container, ctaPlate, farBackdrop],
        markers: []
      },
      HD
    );
    const found = illegible(result);
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("#0f3b2e");
    expect(found[0]?.message).toContain("shape clip behind it");
  });

  it("accepts the same title over a dark plate", () => {
    const result = validateTimelineSequence(
      doc([title({ color: "#cccccc" }), plate({ fill: "#111111" })]),
      HD
    );
    expect(illegible(result)).toEqual([]);
  });

  it("prefers the clip's own background over the shape behind it", () => {
    const result = validateTimelineSequence(
      doc([
        title({
          color: "#cccccc",
          background: { color: "#111111", paddingPx: 8 }
        }),
        plate({ fill: "#ffffff" })
      ]),
      HD
    );
    expect(illegible(result)).toEqual([]);
  });

  it("names the three-letter hex and rgb() notations too", () => {
    const short = validateTimelineSequence(
      doc([title({ color: "#fff", background: { color: "#eee", paddingPx: 8 } })]),
      HD
    );
    expect(illegible(short)).toHaveLength(1);
    const rgb = validateTimelineSequence(
      doc([
        title({
          color: "rgb(255, 255, 255)",
          background: { color: "rgb(238,238,238)", paddingPx: 8 }
        })
      ]),
      HD
    );
    expect(illegible(rgb)).toHaveLength(1);
    const named = validateTimelineSequence(
      doc([title({ color: "white", background: { color: "silver", paddingPx: 8 } })]),
      HD
    );
    expect(illegible(named)).toHaveLength(1);
  });
});

describe("validateTimelineSequence — text over picture", () => {
  /** A video clip on the lower (higher-index) track, i.e. drawn beneath. */
  const picture = (over: Json = {}): Json =>
    base({
      id: "picture",
      trackId: "scrim",
      name: "Shot",
      mediaType: "video",
      startMs: 0,
      durationMs: 4000,
      ...over
    });

  const unproven = (result: { warnings: { code: string; message: string }[] }) =>
    result.warnings.filter((issue) => issue.code === "text_backing_unproven");

  /**
   * The contrast check gives up here — no document says what a video frame
   * looks like — and a silent pass read as approval. It now says it could not
   * judge instead of saying nothing.
   */
  it("reports that it cannot judge bare type over a shot", () => {
    const result = validateTimelineSequence(
      doc([title({}), picture()]),
      HD
    );
    const found = unproven(result);
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("preview_timeline_frame");
    expect(result.ok).toBe(true);
  });

  it("stays quiet once the type carries a scrim or an outline", () => {
    expect(
      unproven(
        validateTimelineSequence(
          doc([
            title({ background: { color: "#000000", paddingPx: 12 } }),
            picture()
          ]),
          HD
        )
      )
    ).toEqual([]);
    expect(
      unproven(
        validateTimelineSequence(
          doc([title({ stroke: { color: "#000000", widthPx: 3 } }), picture()]),
          HD
        )
      )
    ).toEqual([]);
    expect(
      unproven(
        validateTimelineSequence(
          doc([title({}), plate({ fill: "#111111" })]),
          HD
        )
      )
    ).toEqual([]);
    // A small pill plate that actually contains the title counts as proven
    // backing too, same as a full-frame one — the same containment check
    // `backdropShapeColor` uses for the contrast finding above.
    expect(
      unproven(
        validateTimelineSequence(
          doc([
            title({}),
            plate(
              { fill: "#111111" },
              { shapeStyle: { kind: "rect", x: 0.25, y: 0.35, width: 0.5, height: 0.3, fill: "#111111" } }
            )
          ]),
          HD
        )
      )
    ).toEqual([]);
  });

  it("stays quiet when no picture is under the type at all", () => {
    expect(unproven(validateTimelineSequence(doc([title({})]), HD))).toEqual([]);
  });

  it("stays quiet when the shot has finished before the title starts", () => {
    expect(
      unproven(
        validateTimelineSequence(
          doc([title({}), picture({ startMs: 0, durationMs: 500 })]),
          HD
        )
      )
    ).toEqual([]);
  });
});

describe("validateTimelineSequence — text contrast refuses to guess", () => {
  it("says nothing about a translucent plate", () => {
    const result = validateTimelineSequence(
      doc([title({ background: { color: "rgba(255,255,255,0.4)", paddingPx: 8 } })]),
      HD
    );
    expect(illegible(result)).toEqual([]);
  });

  it("says nothing about a colour notation it cannot read", () => {
    const result = validateTimelineSequence(
      doc([title({ background: { color: "oklch(0.9 0.02 250)", paddingPx: 8 } })]),
      HD
    );
    expect(illegible(result)).toEqual([]);
  });

  it("says nothing about gradient-filled type", () => {
    const result = validateTimelineSequence(
      doc([
        title({
          fill: {
            type: "linear",
            angle: 0,
            stops: [
              { offset: 0, color: "#ffffff" },
              { offset: 1, color: "#eeeeee" }
            ]
          },
          background: { color: "#eeeeee", paddingPx: 8 }
        })
      ]),
      HD
    );
    expect(illegible(result)).toEqual([]);
  });

  it("ignores a partial shape that does not contain the title's box", () => {
    // A small corner mark, nowhere near the centered default-positioned
    // title — genuinely unrelated to it, unlike the pill-plate case below.
    const result = validateTimelineSequence(
      doc([
        title({ color: "#cccccc" }),
        plate({ fill: "#ffffff" }, { shapeStyle: { kind: "rect", x: 0.02, y: 0.02, width: 0.2, height: 0.08, fill: "#ffffff" } })
      ]),
      HD
    );
    expect(illegible(result)).toEqual([]);
  });

  it("ignores a shape that leaves before the title does", () => {
    const result = validateTimelineSequence(
      doc([
        title({ color: "#cccccc" }),
        plate({ fill: "#ffffff" }, { startMs: 0, durationMs: 1500 })
      ]),
      HD
    );
    expect(illegible(result)).toEqual([]);
  });

  it("ignores a shape drawn on top of the title", () => {
    const result = validateTimelineSequence(
      {
        tracks: [
          {
            id: "titles",
            name: "Titles",
            type: "overlay",
            index: 1,
            visible: true,
            locked: false
          },
          {
            id: "scrim",
            name: "Scrim",
            type: "video",
            index: 0,
            visible: true,
            locked: false
          }
        ],
        clips: [title({ color: "#cccccc" }), plate({ fill: "#ffffff" })],
        markers: []
      },
      HD
    );
    expect(illegible(result)).toEqual([]);
  });

  it("ignores a translucent shape", () => {
    const result = validateTimelineSequence(
      doc([title({ color: "#cccccc" }), plate({ fill: "#ffffff" }, { opacity: 0.5 })]),
      HD
    );
    expect(illegible(result)).toEqual([]);
  });
});
