import { describe, expect, it } from "vitest";

import {
  DEFAULT_SHAPE_FILL_COLOR,
  DEFAULT_SHAPE_STROKE_COLOR,
  DEFAULT_SHAPE_STROKE_WIDTH_PX,
  DEFAULT_TEXT_CLIP_COLOR,
  shapeStyleWithDefaults,
  textStyleWithDefaults
} from "../src/index.js";

describe("textStyleWithDefaults", () => {
  it("creates visible text defaults", () => {
    expect(textStyleWithDefaults("Title")).toEqual({
      text: "Title",
      fontSizePx: 96,
      color: DEFAULT_TEXT_CLIP_COLOR
    });
  });

  it("keeps the styling the rasterizer draws past the original six fields", () => {
    // Listing the fields dropped every one the schema gained after this was
    // written, so a stroked, shadowed or gradient-filled title reverted to a
    // plain fill on the way in.
    expect(
      textStyleWithDefaults("Title", {
        fontSizePx: 120,
        fontStyle: "italic",
        letterSpacingPx: 4,
        lineHeight: 1.4,
        verticalAlign: "top",
        stroke: { color: "#000000", widthPx: 2 },
        shadow: { color: "#000000", blurPx: 8, offsetX: 2, offsetY: 2 },
        background: { color: "#00000088", paddingPx: 12 },
        fill: { type: "solid", color: "#ff0000" }
      })
    ).toMatchObject({
      fontSizePx: 120,
      fontStyle: "italic",
      letterSpacingPx: 4,
      lineHeight: 1.4,
      verticalAlign: "top",
      stroke: { color: "#000000", widthPx: 2 },
      shadow: { color: "#000000", blurPx: 8, offsetX: 2, offsetY: 2 },
      background: { color: "#00000088", paddingPx: 12 },
      fill: { type: "solid", color: "#ff0000" }
    });
  });
});

describe("shapeStyleWithDefaults", () => {
  it("creates visible defaults for an uncoloured shape and line", () => {
    expect(shapeStyleWithDefaults({ kind: "rect" })).toEqual({
      kind: "rect",
      fill: DEFAULT_SHAPE_FILL_COLOR
    });
    expect(shapeStyleWithDefaults({ kind: "line" })).toEqual({
      kind: "line",
      stroke: DEFAULT_SHAPE_STROKE_COLOR,
      strokeWidthPx: DEFAULT_SHAPE_STROKE_WIDTH_PX
    });
  });

  it("does not outline a shape the caller filled", () => {
    // A translucent scrim came back with a hard white 8px border around it,
    // because the headless bridge defaulted a stroke onto every shape.
    expect(shapeStyleWithDefaults({ kind: "rect", fill: "#05070CCC" })).toEqual({
      kind: "rect",
      fill: "#05070CCC"
    });
    expect(
      shapeStyleWithDefaults({
        kind: "rect",
        fillStyle: {
          type: "linear",
          angle: 90,
          stops: [
            { offset: 0, color: "#05070C00" },
            { offset: 1, color: "#05070CDD" }
          ]
        }
      })
    ).not.toHaveProperty("stroke");
  });

  it("gives a stroke the caller asked for a width to draw at", () => {
    expect(shapeStyleWithDefaults({ kind: "rect", stroke: "#FF0000" })).toEqual({
      kind: "rect",
      stroke: "#FF0000",
      strokeWidthPx: DEFAULT_SHAPE_STROKE_WIDTH_PX
    });
  });

  it("preserves explicit shape styling", () => {
    expect(
      shapeStyleWithDefaults({
        kind: "ellipse",
        fill: "#123456",
        stroke: "#abcdef",
        strokeWidthPx: 3
      })
    ).toEqual({
      kind: "ellipse",
      fill: "#123456",
      stroke: "#abcdef",
      strokeWidthPx: 3
    });
  });
});
