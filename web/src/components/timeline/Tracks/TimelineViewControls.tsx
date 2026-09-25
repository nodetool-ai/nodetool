/** @jsxImportSource @emotion/react */
import React, { memo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import ViewTimelineOutlinedIcon from "@mui/icons-material/ViewTimelineOutlined";

import {
  DEFAULT_MS_PER_PX,
  MAX_MS_PER_PX,
  MAX_VERTICAL_ZOOM,
  MIN_MS_PER_PX,
  MIN_VERTICAL_ZOOM,
  useTimelineUIStore
} from "../../../stores/timeline/TimelineUIStore";
import {
  BORDER_RADIUS,
  FONT_SIZE_MONO,
  FONT_SIZE_SANS,
  FONT_WEIGHT,
  MOTION,
  Popover,
  Slider,
  SPACING,
  getSpacingPx
} from "../../ui_primitives";

const TIME_ZOOM_RANGE = Math.log(MAX_MS_PER_PX / MIN_MS_PER_PX);

const triggerStyles = (theme: Theme, compact: boolean, open: boolean) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: getSpacingPx(SPACING.xs),
    flexShrink: 0,
    minWidth: compact ? theme.spacing(7) : undefined,
    height: compact ? theme.spacing(7) : theme.spacing(6),
    padding: compact ? 0 : theme.spacing(0, 2),
    border: `1px solid ${open ? theme.vars.palette.divider : "transparent"}`,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: open
      ? theme.vars.palette.action.selected
      : "transparent",
    color: open
      ? theme.vars.palette.text.primary
      : theme.vars.palette.text.secondary,
    fontSize: FONT_SIZE_SANS.label,
    fontWeight: FONT_WEIGHT.medium,
    fontFamily: theme.typography.fontFamily,
    cursor: "pointer",
    transition: `${MOTION.background}, color ${MOTION.fast}, ${MOTION.border}`,
    "&:hover": {
      backgroundColor: theme.vars.palette.action.hover,
      color: theme.vars.palette.text.primary,
      borderColor: theme.vars.palette.divider
    },
    "&:focus-visible": {
      outline: `2px solid ${theme.vars.palette.primary.main}`,
      outlineOffset: 2
    }
  });

const panelStyles = (theme: Theme) =>
  css({
    width: theme.spacing(66),
    boxSizing: "border-box",
    padding: getSpacingPx(SPACING.xl),
    display: "grid",
    gap: getSpacingPx(SPACING.lg),
    backgroundColor: theme.vars.palette.background.paper
  });

const rowStyles = css({
  display: "grid",
  gap: getSpacingPx(SPACING.sm)
});

const labelStyles = (theme: Theme) =>
  css({
    display: "flex",
    justifyContent: "space-between",
    color: theme.vars.palette.text.secondary,
    fontSize: FONT_SIZE_SANS.caption
  });

const valueStyles = (theme: Theme) =>
  css({
    color: theme.vars.palette.text.primary,
    fontSize: FONT_SIZE_MONO.caption,
    fontVariantNumeric: "tabular-nums"
  });

const sliderRowStyles = (theme: Theme) =>
  css({
    display: "grid",
    gridTemplateColumns: `${theme.spacing(6)} minmax(0, 1fr) ${theme.spacing(6)}`,
    alignItems: "center",
    gap: getSpacingPx(SPACING.sm)
  });

const stepButtonStyles = (theme: Theme) =>
  css({
    width: theme.spacing(6),
    height: theme.spacing(6),
    display: "grid",
    placeItems: "center",
    padding: 0,
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: "transparent",
    color: theme.vars.palette.text.secondary,
    cursor: "pointer",
    "& svg": { fontSize: theme.fontSizeSmall },
    "&:hover": {
      backgroundColor: theme.vars.palette.action.hover,
      color: theme.vars.palette.text.primary
    },
    "&:disabled": {
      opacity: 0.4,
      cursor: "default"
    },
    "&:focus-visible": {
      outline: `2px solid ${theme.vars.palette.primary.main}`,
      outlineOffset: 2
    }
  });

const sliderStyles = (theme: Theme) => ({
  color: theme.vars.palette.text.primary,
  height: theme.spacing(6),
  padding: 0,
  margin: 0,
  boxSizing: "border-box",
  "& .MuiSlider-rail": {
    height: 3,
    opacity: 1,
    backgroundColor: theme.vars.palette.action.disabledBackground
  },
  "& .MuiSlider-track": {
    height: 3,
    backgroundColor: theme.vars.palette.text.secondary
  },
  "& .MuiSlider-thumb": {
    width: 12,
    height: 12,
    backgroundColor: theme.vars.palette.text.primary,
    border: `2px solid ${theme.vars.palette.background.paper}`,
    boxShadow: theme.shadows[1]
  }
});

interface TimelineViewControlsProps {
  compact: boolean;
}

export const TimelineViewControls: React.FC<TimelineViewControlsProps> = memo(
  ({ compact }) => {
    const theme = useTheme();
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const msPerPx = useTimelineUIStore((state) => state.msPerPx);
    const verticalZoom = useTimelineUIStore((state) => state.verticalZoom);
    const setZoom = useTimelineUIStore((state) => state.setZoom);
    const setVerticalZoom = useTimelineUIStore((state) => state.setVerticalZoom);
    const open = Boolean(anchorEl);

    return (
      <>
        <button
          type="button"
          css={triggerStyles(theme, compact, open)}
          onClick={(event) => setAnchorEl(open ? null : event.currentTarget)}
          aria-label="Timeline view"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? "timeline-view-controls" : undefined}
          title="Timeline view"
        >
          <ViewTimelineOutlinedIcon fontSize="small" />
          {!compact && <span>View</span>}
        </button>
        <Popover
          open={open}
          anchorEl={anchorEl}
          onClose={() => setAnchorEl(null)}
          placement="bottom-right"
          paperSx={{
            border: `1px solid ${theme.vars.palette.divider}`,
            boxShadow: theme.shadows[8],
            borderRadius: BORDER_RADIUS.md
          }}
        >
          <div
            id="timeline-view-controls"
            role="dialog"
            aria-label="Timeline view"
            css={panelStyles(theme)}
          >
            <div css={rowStyles}>
              <div css={labelStyles(theme)}>
                <span>Timeline zoom</span>
                <span css={valueStyles(theme)}>
                  {Math.round((DEFAULT_MS_PER_PX / msPerPx) * 100)}%
                </span>
              </div>
              <div css={sliderRowStyles(theme)}>
                <button
                  type="button"
                  css={stepButtonStyles(theme)}
                  onClick={() => setZoom(msPerPx * 1.25)}
                  aria-label="Zoom out timeline"
                  disabled={msPerPx >= MAX_MS_PER_PX}
                >
                  <RemoveIcon />
                </button>
                <Slider
                  density="compact"
                  sx={sliderStyles(theme)}
                  min={0}
                  max={100}
                  step={1}
                  value={
                    (100 * Math.log(MAX_MS_PER_PX / msPerPx)) /
                    TIME_ZOOM_RANGE
                  }
                  onChange={(_, value) =>
                    setZoom(
                      MAX_MS_PER_PX *
                        Math.exp((-Number(value) / 100) * TIME_ZOOM_RANGE)
                    )
                  }
                  aria-label="Horizontal zoom"
                />
                <button
                  type="button"
                  css={stepButtonStyles(theme)}
                  onClick={() => setZoom(msPerPx * 0.8)}
                  aria-label="Zoom in timeline"
                  disabled={msPerPx <= MIN_MS_PER_PX}
                >
                  <AddIcon />
                </button>
              </div>
            </div>
            <div css={rowStyles}>
              <div css={labelStyles(theme)}>
                <span>Track height</span>
                <span css={valueStyles(theme)}>
                  {Math.round(verticalZoom * 100)}%
                </span>
              </div>
              <div css={sliderRowStyles(theme)}>
                <button
                  type="button"
                  css={stepButtonStyles(theme)}
                  onClick={() => setVerticalZoom(verticalZoom - 0.1)}
                  aria-label="Decrease track height"
                  disabled={verticalZoom <= MIN_VERTICAL_ZOOM}
                >
                  <RemoveIcon />
                </button>
                <Slider
                  density="compact"
                  sx={sliderStyles(theme)}
                  min={MIN_VERTICAL_ZOOM}
                  max={MAX_VERTICAL_ZOOM}
                  step={0.05}
                  value={verticalZoom}
                  onChange={(_, value) => setVerticalZoom(Number(value))}
                  aria-label="Vertical zoom"
                />
                <button
                  type="button"
                  css={stepButtonStyles(theme)}
                  onClick={() => setVerticalZoom(verticalZoom + 0.1)}
                  aria-label="Increase track height"
                  disabled={verticalZoom >= MAX_VERTICAL_ZOOM}
                >
                  <AddIcon />
                </button>
              </div>
            </div>
          </div>
        </Popover>
      </>
    );
  }
);

TimelineViewControls.displayName = "TimelineViewControls";
