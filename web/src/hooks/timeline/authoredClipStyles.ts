import {
  DEFAULT_SHAPE_FILL_COLOR,
  DEFAULT_SHAPE_STROKE_COLOR,
  DEFAULT_SHAPE_STROKE_WIDTH_PX,
  DEFAULT_TEXT_CLIP_COLOR,
  type ClipShapeStyle,
  type ClipTextStyle
} from "@nodetool-ai/timeline";

import type {
  TimelineAddShapeClipOptions,
  TimelineAddTextClipOptions
} from "../../components/timeline/timelineAgentBridge";

export function textStyleWithDefaults(
  opts: TimelineAddTextClipOptions
): ClipTextStyle {
  return {
    text: opts.text,
    fontSizePx: opts.style?.fontSizePx ?? 96,
    color: opts.style?.color ?? DEFAULT_TEXT_CLIP_COLOR,
    fontFamily: opts.style?.fontFamily,
    fontWeight: opts.style?.fontWeight,
    align: opts.style?.align,
    maxWidthFrac: opts.style?.maxWidthFrac
  };
}

export function shapeStyleWithDefaults(
  shape: TimelineAddShapeClipOptions["shape"]
): ClipShapeStyle {
  return {
    ...shape,
    ...(shape.kind === "line"
      ? {
          stroke: shape.stroke ?? DEFAULT_SHAPE_STROKE_COLOR,
          strokeWidthPx: shape.strokeWidthPx ?? DEFAULT_SHAPE_STROKE_WIDTH_PX
        }
      : { fill: shape.fill ?? DEFAULT_SHAPE_FILL_COLOR })
  };
}
