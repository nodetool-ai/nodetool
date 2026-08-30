/** @jsxImportSource @emotion/react */
/**
 * RubberBandOverlay
 *
 * Draws the in-progress rubber-band marquee. It renders in the lanes
 * container rather than in the lane the gesture started on: a band may span
 * several tracks, and each lane clips its own overflow.
 */

import React, { memo, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { Z_INDEX } from "../../ui_primitives";

const rubberBandStyles = (theme: Theme) =>
  css({
    position: "absolute",
    border: `1px solid ${theme.vars.palette.secondary.main}`,
    backgroundColor: `${theme.vars.palette.secondary.main}22`,
    pointerEvents: "none",
    zIndex: Z_INDEX.sticky
  });

export const RubberBandOverlay: React.FC = memo(() => {
  const theme = useTheme();
  const rubberBand = useTimelineUIStore((s) => s.rubberBand);
  const rubberBandCss = useMemo(() => rubberBandStyles(theme), [theme]);

  if (!rubberBand) {
    return null;
  }

  return (
    <div
      css={rubberBandCss}
      data-testid="timeline-rubber-band"
      style={{
        left: rubberBand.left,
        top: rubberBand.top,
        width: rubberBand.width,
        height: rubberBand.height
      }}
      aria-hidden="true"
    />
  );
});

RubberBandOverlay.displayName = "RubberBandOverlay";
