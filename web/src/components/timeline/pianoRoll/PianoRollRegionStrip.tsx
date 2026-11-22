/**
 * The region strip under the ruler: a bar the width of the clip, filled with
 * the clip color and named at both ends. Past the clip's end it shows the same
 * darker shade as the grid.
 */

import React, { memo } from "react";
import { useTheme } from "@mui/material/styles";

import { Caption, SPACING } from "../../ui_primitives";
import { parseCssColor, readableOn } from "./pianoRollColors";
import { tickToX, type PianoRollGeometry } from "./pianoRollGeometry";

/** Height of the strip. */
export const REGION_STRIP_HEIGHT_PX = 14;

interface PianoRollRegionStripProps {
  geometry: PianoRollGeometry;
  widthPx: number;
  windowFromTick: number;
  windowToTick: number;
  name: string;
  /** A plain clip color. Absent falls back to the theme primary color. */
  clipColor?: string;
}

export const PianoRollRegionStrip: React.FC<PianoRollRegionStripProps> = memo(
  ({ geometry, widthPx, windowFromTick, windowToTick, name, clipColor }) => {
    const theme = useTheme();
    const left = Math.max(0, tickToX(windowFromTick, geometry));
    const right = Math.min(widthPx, tickToX(windowToTick, geometry));
    const rgb = parseCssColor(clipColor);
    const fill = clipColor ?? theme.vars.palette.primary.main;
    const textColor = rgb
      ? readableOn(rgb) === "dark"
        ? theme.vars.palette.common.black
        : theme.vars.palette.common.white
      : theme.vars.palette.primary.contrastText;
    return (
      <div
        data-testid="piano-roll-region-strip"
        style={{
          position: "relative",
          height: REGION_STRIP_HEIGHT_PX,
          flexShrink: 0,
          overflow: "hidden",
          backgroundColor: theme.vars.palette.action.disabledBackground
        }}
      >
        {right > left && (
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left,
              width: right - left,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              overflow: "hidden",
              backgroundColor: fill,
              color: textColor
            }}
          >
            <Caption color="inherit" sx={{ whiteSpace: "nowrap", px: SPACING.xs, lineHeight: 1 }}>{name}</Caption>
            <Caption color="inherit" sx={{ whiteSpace: "nowrap", px: SPACING.xs, lineHeight: 1 }}>{name}</Caption>
          </div>
        )}
      </div>
    );
  }
);

PianoRollRegionStrip.displayName = "PianoRollRegionStrip";
