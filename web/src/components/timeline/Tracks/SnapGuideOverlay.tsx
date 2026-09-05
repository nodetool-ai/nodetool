/** @jsxImportSource @emotion/react */
/**
 * SnapGuideOverlay
 *
 * A 1px vertical line at the position a drag or trim gesture is snapped to.
 * Renders in the lanes container so it spans every track, like the
 * rubber-band marquee.
 */

import React, { memo, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { Z_INDEX } from "../../ui_primitives";

const guideStyles = (theme: Theme) =>
  css({
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: theme.vars.palette.secondary.main,
    pointerEvents: "none",
    zIndex: Z_INDEX.sticky
  });

export const SnapGuideOverlay: React.FC = memo(() => {
  const theme = useTheme();
  const snapGuideMs = useTimelineUIStore((s) => s.snapGuideMs);
  const msPerPx = useTimelineUIStore((s) => s.msPerPx);
  const guideCss = useMemo(() => guideStyles(theme), [theme]);

  if (snapGuideMs === null) {
    return null;
  }

  return (
    <div
      css={guideCss}
      data-testid="timeline-snap-guide"
      style={{ left: snapGuideMs / msPerPx }}
      aria-hidden="true"
    />
  );
});

SnapGuideOverlay.displayName = "SnapGuideOverlay";
