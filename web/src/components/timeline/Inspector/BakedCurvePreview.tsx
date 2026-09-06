/** @jsxImportSource @emotion/react */
/**
 * BakedCurvePreview — the shape of a baked curve, value over time.
 *
 * A bake writes hundreds of keyframes; the inspector's keyframe table shows
 * them as numbers and nothing shows what the motion does. This is the missing
 * read: one polyline, no axes, no interaction. Deliberately not a graph editor
 * — a baked curve is read-only in the inspector (see `ClipCustomCurves`), so
 * there is nothing here to drag.
 *
 * Pure: props in, SVG out. No store, no theme hook — colours come from the
 * palette CSS variables, so it renders correctly in both themes and in a test
 * with no provider.
 */
import React, { memo } from "react";
import { css } from "@emotion/react";

import { BORDER_RADIUS, FONT_SIZE_MONO, SPACING, getSpacingPx } from "../../ui_primitives";

/** One point of the curve: where it sits, and what it is worth there. */
export interface BakedCurvePoint {
  timeMs: number;
  value: number;
}

/** The drawing box. Fixed, because the polyline is scaled into its viewBox. */
const VIEW_WIDTH = 100;
const VIEW_HEIGHT = 32;
const PREVIEW_HEIGHT = 48;

/**
 * The `points` attribute for the polyline: time across, value up, both scaled
 * to the viewBox so a curve reads the same whatever its units are.
 *
 * A flat curve (every value equal, or a single point) is drawn along the
 * middle rather than divided by a zero span — "no variation" is a shape worth
 * seeing, not an error.
 */
export function bakedCurvePolyline(
  points: readonly BakedCurvePoint[]
): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    return `0,${VIEW_HEIGHT / 2} ${VIEW_WIDTH},${VIEW_HEIGHT / 2}`;
  }

  let minTime = Infinity;
  let maxTime = -Infinity;
  let minValue = Infinity;
  let maxValue = -Infinity;
  for (const point of points) {
    if (point.timeMs < minTime) minTime = point.timeMs;
    if (point.timeMs > maxTime) maxTime = point.timeMs;
    if (point.value < minValue) minValue = point.value;
    if (point.value > maxValue) maxValue = point.value;
  }

  const timeSpan = maxTime - minTime;
  const valueSpan = maxValue - minValue;
  return points
    .map((point) => {
      const x =
        timeSpan > 0 ? ((point.timeMs - minTime) / timeSpan) * VIEW_WIDTH : 0;
      // SVG y grows downward, so the loud end of the range is the low y.
      const y =
        valueSpan > 0
          ? VIEW_HEIGHT - ((point.value - minValue) / valueSpan) * VIEW_HEIGHT
          : VIEW_HEIGHT / 2;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

const wrapStyles = css({
  display: "flex",
  flexDirection: "column",
  gap: getSpacingPx(SPACING.micro),
  padding: getSpacingPx(SPACING.xs),
  borderRadius: BORDER_RADIUS.md,
  border: "1px solid var(--palette-divider)",
  backgroundColor: "var(--palette-background-default)"
});

const svgStyles = css({
  display: "block",
  width: "100%",
  height: PREVIEW_HEIGHT
});

const rangeRowStyles = css({
  display: "flex",
  justifyContent: "space-between",
  fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: FONT_SIZE_MONO.caption,
  color: "var(--palette-text-secondary)"
});

export interface BakedCurvePreviewProps {
  points: readonly BakedCurvePoint[];
  /** Accessible name, e.g. "scale from audio". */
  label: string;
}

export const BakedCurvePreview: React.FC<BakedCurvePreviewProps> = memo(
  ({ points, label }) => {
    const polyline = bakedCurvePolyline(points);
    if (polyline === "") return null;

    const values = points.map((point) => point.value);
    const low = Math.min(...values);
    const high = Math.max(...values);
    const format = (value: number) =>
      Number.isInteger(value) ? String(value) : value.toFixed(2);

    return (
      <div css={wrapStyles}>
        <svg
          css={svgStyles}
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${label} curve, ${points.length} keyframes`}
        >
          <polyline
            points={polyline}
            fill="none"
            stroke="var(--palette-primary-main)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div css={rangeRowStyles}>
          <span>{format(low)}</span>
          <span>{format(high)}</span>
        </div>
      </div>
    );
  }
);
BakedCurvePreview.displayName = "BakedCurvePreview";
