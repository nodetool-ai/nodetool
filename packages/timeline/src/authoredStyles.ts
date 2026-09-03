/**
 * The defaults an authored text or shape clip gets when the caller leaves a
 * field out.
 *
 * Both surfaces that place these clips — the live editor's agent bridge in
 * `web/` and the headless bridge `edit_timeline` dispatches to — used to carry
 * their own copy, and the copies disagreed: the headless one stroked *every*
 * shape white 8px, so a translucent scrim authored as a gradient rectangle
 * came back with a hard white outline around it, while the same call in the
 * browser drew the scrim alone. One implementation, so a shape placed by an
 * agent looks like the same shape placed by hand.
 *
 * The rule is "make an under-specified clip visible, and change nothing the
 * caller said". A rect or ellipse with no colours at all gets a white fill; a
 * line gets a white stroke, since a line has no interior to fill. A caller who
 * named a fill (or a `fillStyle` gradient) and no stroke gets no stroke — a
 * stroke is a second decision, and defaulting one onto a scrim is a visible
 * mark nobody asked for.
 */

import {
  DEFAULT_SHAPE_FILL_COLOR,
  DEFAULT_SHAPE_STROKE_COLOR,
  DEFAULT_SHAPE_STROKE_WIDTH_PX,
  DEFAULT_TEXT_CLIP_COLOR,
  DEFAULT_TEXT_CLIP_FONT_SIZE_PX
} from "./defaults.js";
import type { ClipShapeStyle, ClipTextStyle } from "./types.js";

/**
 * A text clip's stored style: the caller's own fields, the words, and a
 * readable size and colour when those were left out.
 *
 * Spread rather than field-by-field: the style bag is the document schema, so
 * a stroke, a shadow or a gradient the caller asked for is authored the day
 * the schema gains it instead of being silently dropped.
 */
export function textStyleWithDefaults(
  text: string,
  style?: Partial<Omit<ClipTextStyle, "text">>
): ClipTextStyle {
  return {
    ...style,
    text,
    fontSizePx: style?.fontSizePx ?? DEFAULT_TEXT_CLIP_FONT_SIZE_PX,
    color: style?.color ?? DEFAULT_TEXT_CLIP_COLOR
  };
}

/**
 * A shape clip's stored style. See the module note for why a filled shape gets
 * no stroke of its own.
 */
export function shapeStyleWithDefaults(shape: ClipShapeStyle): ClipShapeStyle {
  if (shape.kind === "line") {
    return {
      ...shape,
      stroke: shape.stroke ?? DEFAULT_SHAPE_STROKE_COLOR,
      strokeWidthPx: shape.strokeWidthPx ?? DEFAULT_SHAPE_STROKE_WIDTH_PX
    };
  }
  const hasFill = shape.fill !== undefined || shape.fillStyle !== undefined;
  const hasStroke = shape.stroke !== undefined;
  if (hasFill || hasStroke) {
    // The caller decided how this shape is coloured. Only a stroke width is
    // filled in, and only for a stroke they asked for: a colour with no width
    // draws nothing, which reads as the tool ignoring the argument.
    return hasStroke && shape.strokeWidthPx === undefined
      ? { ...shape, strokeWidthPx: DEFAULT_SHAPE_STROKE_WIDTH_PX }
      : { ...shape };
  }
  return { ...shape, fill: DEFAULT_SHAPE_FILL_COLOR };
}
