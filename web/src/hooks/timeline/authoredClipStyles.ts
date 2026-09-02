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
  // Spread rather than list the fields: the style bag is the document schema,
  // so a stroke, a shadow or a gradient the caller asked for is authored here
  // the day the schema gains it, instead of being silently dropped.
  return {
    ...opts.style,
    text: opts.text,
    fontSizePx: opts.style?.fontSizePx ?? 96,
    color: opts.style?.color ?? DEFAULT_TEXT_CLIP_COLOR
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
