/** @jsxImportSource @emotion/react */
/**
 * GestureReadout
 *
 * A mono timecode pill showing the live geometry of the clip under a drag or
 * trim gesture:
 *   move       start · duration
 *   trim-start in    · duration
 *   trim-end   duration · end
 *
 * It sits pinned to the top-left corner of the visible lanes viewport. The
 * wrapper is a zero-size sticky box placed first in the lanes container, so
 * it takes no layout space and stays put while the lanes scroll on both axes.
 */

import React, { memo, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import type { GestureReadout as GestureReadoutValue } from "../../../stores/timeline/TimelineUIStore";
import { formatTimecode } from "../Inspector/InspectorPrimitives.helpers";
import {
  BORDER_RADIUS,
  FONT_SIZE_MONO,
  FONT_WEIGHT,
  SPACING,
  Z_INDEX,
  getSpacingPx
} from "../../ui_primitives";

const anchorStyles = css({
  position: "sticky",
  top: 0,
  left: 0,
  width: 0,
  height: 0,
  zIndex: Z_INDEX.sticky + 1,
  pointerEvents: "none"
});

const pillStyles = (theme: Theme) =>
  css({
    position: "absolute",
    top: getSpacingPx(SPACING.xs),
    left: getSpacingPx(SPACING.xs),
    height: 18,
    padding: `0 ${getSpacingPx(SPACING.sm)}`,
    display: "inline-flex",
    alignItems: "center",
    borderRadius: BORDER_RADIUS.sm,
    border: `1px solid ${theme.vars.palette.divider}`,
    backgroundColor: theme.vars.palette.background.paper,
    color: theme.vars.palette.text.secondary,
    fontFamily:
      "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: FONT_SIZE_MONO.caption,
    fontWeight: FONT_WEIGHT.semibold,
    letterSpacing: "0.04em",
    whiteSpace: "nowrap",
    boxShadow: `0 2px 6px ${theme.vars.palette.c_scrim_soft}`
  });

/** The two timecodes the pill shows for a gesture kind. */
export function readoutText(
  readout: GestureReadoutValue,
  fps: number
): string {
  const tc = (ms: number) => formatTimecode(ms, fps);
  switch (readout.kind) {
    case "move":
      return `${tc(readout.startMs)} · ${tc(readout.durationMs)}`;
    case "trim-start":
      return `${tc(readout.inPointMs)} · ${tc(readout.durationMs)}`;
    case "trim-end":
      return `${tc(readout.durationMs)} · ${tc(readout.startMs + readout.durationMs)}`;
  }
}

export const GestureReadout: React.FC = memo(() => {
  const theme = useTheme();
  const readout = useTimelineUIStore((s) => s.gestureReadout);
  const fps = useTimelineStore((s) => s.fps);
  const pillCss = useMemo(() => pillStyles(theme), [theme]);

  if (!readout) {
    return null;
  }

  return (
    <div css={anchorStyles} aria-hidden="true">
      <div css={pillCss} data-testid="timeline-gesture-readout">
        {readoutText(readout, fps)}
      </div>
    </div>
  );
});

GestureReadout.displayName = "GestureReadout";
