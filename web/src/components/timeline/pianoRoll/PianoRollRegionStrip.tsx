/**
 * The region strip under the ruler: a bar the width of the clip, filled with
 * the clip color and named at both ends. Past the clip's end it shows the same
 * darker shade as the grid.
 */

import React, { memo } from "react";
import { useTheme } from "@mui/material/styles";
import type { TimelineClip } from "@nodetool-ai/timeline";

import { Caption, SPACING } from "../../ui_primitives";
import { tickToX, type PianoRollGeometry } from "./pianoRollGeometry";

/**
 * One short badge per active region parameter (CE6, D53), so a clip that
 * plays differently from its stored notes says so where the notes are drawn.
 */
export function regionParamBadges(
  clip: Pick<TimelineClip, "transpose" | "velocityOffset" | "quantize">
): string[] {
  const badges: string[] = [];
  const t = clip.transpose ?? 0;
  if (t !== 0) badges.push(`${t > 0 ? "+" : ""}${t} st`);
  const v = clip.velocityOffset ?? 0;
  if (v !== 0) badges.push(`Vel ${v > 0 ? "+" : ""}${v}`);
  if (clip.quantize && clip.quantize.strength > 0) {
    badges.push(`Q ${clip.quantize.grid} ${clip.quantize.strength}%`);
  }
  return badges;
}

/** Height of the strip. */
export const REGION_STRIP_HEIGHT_PX = 14;
/** How much of the clip color the strip shows: the region at low weight, as in Logic. */
const REGION_TINT_PERCENT = 30;

interface PianoRollRegionStripProps {
  geometry: PianoRollGeometry;
  widthPx: number;
  windowFromTick: number;
  windowToTick: number;
  name: string;
  /** A plain clip color. Absent falls back to the theme primary color. */
  clipColor?: string;
  /** Active region parameters, from {@link regionParamBadges}. */
  badges?: readonly string[];
}

export const PianoRollRegionStrip: React.FC<PianoRollRegionStripProps> = memo(
  ({ geometry, widthPx, windowFromTick, windowToTick, name, clipColor, badges = [] }) => {
    const theme = useTheme();
    const left = Math.max(0, tickToX(windowFromTick, geometry));
    const right = Math.min(widthPx, tickToX(windowToTick, geometry));
    const fill = clipColor ?? theme.vars.palette.primary.main;
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
              backgroundColor: `color-mix(in srgb, ${fill} ${REGION_TINT_PERCENT}%, transparent)`,
              borderTop: `2px solid ${fill}`,
              color: theme.vars.palette.text.primary
            }}
          >
            <Caption color="inherit" sx={{ whiteSpace: "nowrap", px: SPACING.xs, lineHeight: 1 }}>{name}</Caption>
            {badges.length > 0 && (
              <Caption
                color="inherit"
                data-testid="piano-roll-region-badges"
                sx={{ whiteSpace: "nowrap", px: SPACING.xs, lineHeight: 1 }}
              >
                {badges.join(" · ")}
              </Caption>
            )}
            <Caption color="inherit" sx={{ whiteSpace: "nowrap", px: SPACING.xs, lineHeight: 1 }}>{name}</Caption>
          </div>
        )}
      </div>
    );
  }
);

PianoRollRegionStrip.displayName = "PianoRollRegionStrip";
