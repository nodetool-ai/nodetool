/** @jsxImportSource @emotion/react */
/**
 * SectionRangeOverlay
 *
 * The range picked with Shift+drag in the ruler, drawn over every lane. It
 * renders in the lanes container, like the rubber-band marquee.
 */

import React, { memo, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";

import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { Z_INDEX } from "../../ui_primitives";

const rangeStyles = (theme: Theme) =>
  css({
    position: "absolute",
    top: 0,
    bottom: 0,
    // `theme.vars` colors are CSS variables, so the fill uses the channel form.
    backgroundColor: theme.vars.palette.c_timeline_range_fill,
    borderLeft: `1px solid ${theme.vars.palette.c_timeline_range}`,
    borderRight: `1px solid ${theme.vars.palette.c_timeline_range}`,
    boxSizing: "border-box",
    pointerEvents: "none",
    zIndex: Z_INDEX.sticky
  });

export const SectionRangeOverlay: React.FC = memo(() => {
  const theme = useTheme();
  const { t } = useTranslation();
  const range = useTimelineUIStore((s) => s.sectionRange);
  const msPerPx = useTimelineUIStore((s) => s.msPerPx);
  const rangeCss = useMemo(() => rangeStyles(theme), [theme]);
  if (!range) {
    return null;
  }
  return (
    <div
      css={rangeCss}
      data-testid="timeline-section-range"
      role="img"
      aria-label={t("i18n-next59.rangeMenu.overlay")}
      style={{
        left: range.fromMs / msPerPx,
        width: (range.toMs - range.fromMs) / msPerPx
      }}
    />
  );
});

SectionRangeOverlay.displayName = "SectionRangeOverlay";
