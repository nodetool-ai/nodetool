/**
 * The timeline agent tools' parameter schemas.
 *
 * What these pin is I11: the headless bridge, the browser tools and the live
 * editor's handler read one field list, and it is the document schema itself.
 * Each of those three used to spell the style bags out by hand and each copy
 * fell behind the renderer, so a stroked title or a dashed path was storable
 * in the document and unreachable from a tool call.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  captionStyle,
  clipShapeStyle,
  clipTextStyle,
  KNOWN_CLIP_EFFECT_TYPE_LIST,
  KNOWN_TRANSITION_TYPE_LIST
} from "../src/api-schemas/timeline.js";
import {
  addGroupParams,
  buildEffect,
  buildMask,
  buildTimeRemap,
  buildTransition,
  captionStyleParams,
  effectParams,
  partialTextStyleParams,
  setParentParams,
  setTimeRemapParams,
  shapeStyleParams,
  textStyleParams,
  transitionParams,
  withFieldNotes,
  SHARED_TIMELINE_TOOL_NAMES
} from "../src/api-schemas/timeline-tool-params.js";

const fields = (schema: z.ZodObject<z.ZodRawShape>) =>
  Object.keys(schema.shape).sort();

describe("style bags mirror the document schema", () => {
  it("accepts exactly the fields a save would store", () => {
    expect(fields(textStyleParams)).toEqual(fields(clipTextStyle));
    expect(fields(shapeStyleParams)).toEqual(fields(clipShapeStyle));
    expect(fields(captionStyleParams)).toEqual(fields(captionStyle));
  });

  it("keeps the styling the pre-T14 hand-written copies dropped", () => {
    const parsed = textStyleParams.parse({
      text: "SCRAPHEART",
      fontSizePx: 120,
      color: "#ffffff",
      fontStyle: "italic",
      letterSpacingPx: 6,
      lineHeight: 1.1,
      verticalAlign: "top",
      stroke: { color: "#000000", widthPx: 3 },
      shadow: { color: "#000000", blurPx: 12, offsetX: 0, offsetY: 4 },
      background: { color: "#00000099", paddingPx: 24 },
      fill: { type: "solid", color: "#ff0000" }
    });
    expect(parsed.stroke).toEqual({ color: "#000000", widthPx: 3 });
    expect(parsed.fill).toEqual({ type: "solid", color: "#ff0000" });
  });

  it("takes the shape kinds the path renderer draws", () => {
    for (const kind of ["path", "polygon", "star"]) {
      expect(
        shapeStyleParams.parse({ kind, sides: 6, dash: [0.02], trimEnd: 0.5 })
          .kind
      ).toBe(kind);
    }
  });

  it("drops `text` on the add_text_clip half and requires nothing", () => {
    expect(fields(partialTextStyleParams)).not.toContain("text");
    expect(partialTextStyleParams.parse({})).toEqual({});
  });
});

describe("flat bags enumerate the document schema's own types", () => {
  it("offers every transition this build draws, and nothing else", () => {
    for (const type of KNOWN_TRANSITION_TYPE_LIST) {
      expect(
        transitionParams.parse({ type, durationMs: 200 }).type
      ).toBe(type);
    }
    expect(() =>
      transitionParams.parse({ type: "flip", durationMs: 200 })
    ).toThrow();
  });

  it("offers every effect this build applies, and nothing else", () => {
    for (const type of KNOWN_CLIP_EFFECT_TYPE_LIST) {
      expect(effectParams.parse({ type }).type).toBe(type);
    }
    expect(() => effectParams.parse({ type: "halation" })).toThrow();
  });
});

describe("build helpers keep only the fields the named type reads", () => {
  it("drops a colour sent with a push", () => {
    expect(
      buildTransition({
        type: "push",
        durationMs: 300,
        color: "#000000",
        direction: "up"
      })
    ).toEqual({ type: "push", durationMs: 300, direction: "up" });
  });

  it("drops a rect's bounds off a path mask, and refuses unreadable data", () => {
    const mask = buildMask({ kind: "path", d: "M 0 0 L 1 1 Z", x: 0.5 });
    expect(mask.x).toBeUndefined();
    expect(mask.d).toBe("M 0 0 L 1 1 Z");
    expect(() =>
      buildMask({ kind: "path", d: "nope" }, () => ({
        ok: false,
        error: "bad command"
      }))
    ).toThrow(/bad command/);
  });

  it("drops a levels knob off a glow", () => {
    expect(buildEffect({ type: "glow", radius: 9, inBlack: 0.5 }, 0)).toEqual({
      id: "fx-1",
      type: "glow",
      enabled: true,
      radius: 9,
      intensity: 1,
      color: undefined
    });
  });
});

describe("structural op inputs", () => {
  it("takes a group's window and the children to put in it", () => {
    expect(
      addGroupParams.parse({
        name: "Title block",
        startMs: 0,
        durationMs: 4000,
        children: ["shot a"]
      })
    ).toMatchObject({ name: "Title block", children: ["shot a"] });
  });

  it("takes null as the way to release a clip from its group", () => {
    expect(setParentParams.parse({ target: "shot a", parentId: null })).toEqual(
      { target: "shot a", parentId: null }
    );
  });
});

describe("the shared tool name list", () => {
  it("names the structural tools both surfaces must register", () => {
    for (const name of [
      "ui_timeline_add_group",
      "ui_timeline_set_parent",
      "ui_timeline_set_transition",
      "ui_timeline_set_mask",
      "ui_timeline_set_matte",
      "ui_timeline_set_time_remap",
      "ui_timeline_set_effects"
    ]) {
      expect(SHARED_TIMELINE_TOOL_NAMES).toContain(name);
    }
  });

  it("leaves out the browser-only frame sampler", () => {
    // It needs real rendered video, so there is no headless twin to demand.
    expect(SHARED_TIMELINE_TOOL_NAMES).not.toContain(
      "ui_timeline_get_clip_frames"
    );
  });
});

describe("a note cannot outlive the field it describes", () => {
  it("attaches the note to the field and leaves the rest alone", () => {
    const noted = withFieldNotes(captionStyle, {
      activeColor: "Colour of the word being spoken."
    });
    expect(noted.shape.activeColor.description).toBe(
      "Colour of the word being spoken."
    );
    expect(fields(noted)).toEqual(fields(captionStyle));
  });

  it("throws on a note naming a field the schema does not have", () => {
    // I12's fixture: a renamed or removed document field looks exactly like
    // this, and the throw is at import time, so a stale note cannot ship.
    expect(() =>
      withFieldNotes(captionStyle.omit({ activeColor: true }), {
        // @ts-expect-error the point of the case is a note the schema lost
        activeColor: "Colour of the word being spoken."
      })
    ).toThrow(/no field "activeColor" to describe/);
  });
});

describe("the time-remap curve", () => {
  const two = [
    { t: 0, sourceMs: 0 },
    { t: 1, sourceMs: 1000 }
  ];

  it("takes a curve, and null as the way to play at the clip's rate", () => {
    expect(
      setTimeRemapParams.parse({ target: "shot a", timeRemap: { keyframes: two } })
    ).toMatchObject({ target: "shot a" });
    expect(
      setTimeRemapParams.parse({ target: "shot a", timeRemap: null })
    ).toEqual({ target: "shot a", timeRemap: null });
  });

  it("refuses a single keyframe, a t off the window, and a negative source", () => {
    expect(() =>
      setTimeRemapParams.parse({
        target: "shot a",
        timeRemap: { keyframes: [{ t: 0, sourceMs: 0 }] }
      })
    ).toThrow();
    expect(() =>
      setTimeRemapParams.parse({
        target: "shot a",
        timeRemap: { keyframes: [{ t: 0, sourceMs: 0 }, { t: 1.5, sourceMs: 10 }] }
      })
    ).toThrow();
    expect(() =>
      setTimeRemapParams.parse({
        target: "shot a",
        timeRemap: { keyframes: [{ t: 0, sourceMs: -1 }, { t: 1, sourceMs: 10 }] }
      })
    ).toThrow();
  });

  it("refuses a list that does not ascend in t", () => {
    // The sampler reads array order and never sorts, so an out-of-order list
    // reads the wrong source instant rather than failing.
    expect(() =>
      buildTimeRemap({
        keyframes: [
          { t: 0, sourceMs: 0 },
          { t: 0.7, sourceMs: 100 },
          { t: 0.3, sourceMs: 200 },
          { t: 1, sourceMs: 300 }
        ]
      })
    ).toThrow(/ascend/);
  });

  it("refuses a curve that does not span the clip's window", () => {
    expect(() =>
      buildTimeRemap({ keyframes: [{ t: 0.2, sourceMs: 0 }, { t: 1, sourceMs: 10 }] })
    ).toThrow(/first keyframe/);
    expect(() =>
      buildTimeRemap({ keyframes: [{ t: 0, sourceMs: 0 }, { t: 0.9, sourceMs: 10 }] })
    ).toThrow(/last/);
  });

  it("leaves an unset easing off the stored keyframe", () => {
    const built = buildTimeRemap({
      keyframes: [
        { t: 0, sourceMs: 0 },
        { t: 1, sourceMs: 500, easing: "easeIn" }
      ]
    });
    expect(built.keyframes[0]).toEqual({ t: 0, sourceMs: 0 });
    expect(built.keyframes[1]).toEqual({ t: 1, sourceMs: 500, easing: "easeIn" });
  });
});
