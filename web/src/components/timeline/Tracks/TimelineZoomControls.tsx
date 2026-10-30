/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/AddOutlined";
import RemoveIcon from "@mui/icons-material/Remove";
import FitScreenIcon from "@mui/icons-material/FitScreen";

import {
  DEFAULT_MS_PER_PX,
  MAX_MS_PER_PX,
  MAX_VERTICAL_ZOOM,
  MIN_MS_PER_PX,
  MIN_VERTICAL_ZOOM,
  useTimelineUIStore
} from "../../../stores/timeline/TimelineUIStore";
import { BORDER_RADIUS, SPACING, Slider, Tooltip, getSpacingPx } from "../../ui_primitives";

const TIME_ZOOM_RANGE = Math.log(MAX_MS_PER_PX / MIN_MS_PER_PX);

const groupStyles = css({
  display: "inline-flex",
  alignItems: "center",
  gap: getSpacingPx(SPACING.xs),
  flexShrink: 0
});

const stepButtonStyles = (theme: Theme) =>
  css({
    width: theme.spacing(6),
    height: theme.spacing(6),
    flexShrink: 0,
    display: "grid",
    placeItems: "center",
    padding: 0,
    border: "1px solid transparent",
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

/** Layout only: the slider fills the step-button row height. The look is Slider's. */
const sliderLayoutSx = (theme: Theme) => ({
  height: theme.spacing(6),
  padding: 0,
  margin: 0,
  boxSizing: "border-box"
});

interface TimelineZoomControlsProps {
  /** Narrow toolbar: keep the step buttons, drop the slider. */
  compact: boolean;
  /** Fits all content to the viewport (the Shift+Z handler). */
  onZoomToFit?: () => void;
}

/** Horizontal zoom, inline in the timeline toolbar. */
export const TimelineZoomControls: React.FC<TimelineZoomControlsProps> = memo(
  ({ compact, onZoomToFit }) => {
    const theme = useTheme();
    const { t } = useTranslation();
    const msPerPx = useTimelineUIStore((state) => state.msPerPx);
    const setZoom = useTimelineUIStore((state) => state.setZoom);
    const zoomPercent = Math.round((DEFAULT_MS_PER_PX / msPerPx) * 100);

    return (
      <div
        css={groupStyles}
        role="group"
        aria-label={t("i18n-next59.controls.horizontalZoom")}
      >
        <button
          type="button"
          css={stepButtonStyles(theme)}
          onClick={() => setZoom(msPerPx * 1.25)}
          aria-label={t("i18n-next59.controls.zoomOut")}
          disabled={msPerPx >= MAX_MS_PER_PX}
        >
          <RemoveIcon />
        </button>
        {!compact && (
          <Tooltip title={`${zoomPercent}%`} placement="bottom">
            <Slider
              density="compact"
              sx={{ ...sliderLayoutSx(theme), width: theme.spacing(24) }}
              min={0}
              max={100}
              step={1}
              value={
                (100 * Math.log(MAX_MS_PER_PX / msPerPx)) / TIME_ZOOM_RANGE
              }
              onChange={(_, value) =>
                setZoom(
                  MAX_MS_PER_PX *
                    Math.exp((-Number(value) / 100) * TIME_ZOOM_RANGE)
                )
              }
              aria-label={t("i18n-next59.controls.horizontalZoom")}
              aria-valuetext={`${zoomPercent}%`}
            />
          </Tooltip>
        )}
        <button
          type="button"
          css={stepButtonStyles(theme)}
          onClick={() => setZoom(msPerPx * 0.8)}
          aria-label={t("i18n-next59.controls.zoomIn")}
          disabled={msPerPx <= MIN_MS_PER_PX}
        >
          <AddIcon />
        </button>
        {onZoomToFit && (
          <Tooltip
            title={t("i18n-next59.controls.zoomToFit")}
            shortcut={["Shift", "Z"]}
          >
            <button
              type="button"
              css={stepButtonStyles(theme)}
              onClick={onZoomToFit}
              aria-label={t("i18n-next59.controls.zoomToFit")}
            >
              <FitScreenIcon />
            </button>
          </Tooltip>
        )}
      </div>
    );
  }
);

TimelineZoomControls.displayName = "TimelineZoomControls";

/**
 * Track height, in the tracks panel header. Shrinks with the header column, so
 * a narrow column keeps the label and the add button.
 */
export const TrackHeightSlider: React.FC = memo(() => {
  const theme = useTheme();
  const { t } = useTranslation();
  const verticalZoom = useTimelineUIStore((state) => state.verticalZoom);
  const setVerticalZoom = useTimelineUIStore((state) => state.setVerticalZoom);
  const percent = `${Math.round(verticalZoom * 100)}%`;

  return (
    <Tooltip
      title={`${t("i18n-next59.controls.trackHeight")} ${percent}`}
      placement="bottom"
    >
      <Slider
        density="compact"
        sx={{
          ...sliderLayoutSx(theme),
          flex: `0 1 ${theme.spacing(24)}`,
          minWidth: 0,
          marginLeft: "auto"
        }}
        min={MIN_VERTICAL_ZOOM}
        max={MAX_VERTICAL_ZOOM}
        step={0.05}
        value={verticalZoom}
        onChange={(_, value) => setVerticalZoom(Number(value))}
        aria-label={t("i18n-next59.controls.trackHeight")}
        aria-valuetext={percent}
        data-testid="track-height-slider"
      />
    </Tooltip>
  );
});

TrackHeightSlider.displayName = "TrackHeightSlider";
