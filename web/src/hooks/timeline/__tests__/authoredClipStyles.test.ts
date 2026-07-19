import {
  DEFAULT_SHAPE_FILL_COLOR,
  DEFAULT_SHAPE_STROKE_COLOR,
  DEFAULT_SHAPE_STROKE_WIDTH_PX,
  DEFAULT_TEXT_CLIP_COLOR
} from "@nodetool-ai/timeline";

import {
  shapeStyleWithDefaults,
  textStyleWithDefaults
} from "../authoredClipStyles";

describe("authored clip style defaults", () => {
  it("creates visible text defaults", () => {
    expect(textStyleWithDefaults({ text: "Title" })).toEqual({
      text: "Title",
      fontSizePx: 96,
      color: DEFAULT_TEXT_CLIP_COLOR,
      fontFamily: undefined,
      fontWeight: undefined,
      align: undefined,
      maxWidthFrac: undefined
    });
  });

  it("creates visible defaults for filled shapes and lines", () => {
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
