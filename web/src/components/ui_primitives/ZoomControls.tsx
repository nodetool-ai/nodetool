/** @jsxImportSource @emotion/react */
import React, { useCallback, memo } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { IconButton, Box, Typography } from "@mui/material";
import { Tooltip } from "./Tooltip";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { CONTROL, MOTION } from "./tokens";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(0.5),
    ".zoom-button": {
      borderRadius: theme.rounded.lg,
      backgroundColor: "transparent",
      color: theme.vars.palette.text.secondary,
      transition: MOTION.fast,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        color: theme.vars.palette.text.primary
      },
      "&:disabled": {
        color: theme.vars.palette.action.disabled
      }
    },
    ".zoom-value": {
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.secondary,
      minWidth: `${CONTROL.height.xl}px`,
      textAlign: "center",
      fontFamily: "var(--fontFamily2)"
    }
  });

export interface ZoomControlsProps {
  /** Current zoom level (1 = 100%) */
  zoom: number;
  /** Callback when zoom changes */
  onZoomChange: (zoom: number) => void;
  /** Minimum zoom level (default: 0.1) */
  minZoom?: number;
  /** Maximum zoom level (default: 5) */
  maxZoom?: number;
  /** Zoom step amount (default: 0.1) */
  step?: number;
  /** Button size */
  buttonSize?: "small" | "medium";
  /** Show zoom percentage value */
  showValue?: boolean;
  /** Show reset button */
  showReset?: boolean;
  /** Default zoom for reset (default: 1) */
  defaultZoom?: number;
  /** Tooltip placement */
  tooltipPlacement?: "top" | "bottom" | "left" | "right";
  /** Custom class name */
  className?: string;
}

export const ZoomControls: React.FC<ZoomControlsProps> = memo(({
  zoom,
  onZoomChange,
  minZoom = 0.1,
  maxZoom = 5,
  step = 0.1,
  buttonSize = "small",
  showValue = true,
  showReset = true,
  defaultZoom = 1,
  tooltipPlacement = "top",
  className
}) => {
  const theme = useTheme();
  const { t } = useTranslation();

  const handleZoomIn = useCallback(() => {
    onZoomChange(Math.min(maxZoom, zoom + step));
  }, [zoom, maxZoom, step, onZoomChange]);

  const handleZoomOut = useCallback(() => {
    onZoomChange(Math.max(minZoom, zoom - step));
  }, [zoom, minZoom, step, onZoomChange]);

  const handleReset = useCallback(() => {
    onZoomChange(defaultZoom);
  }, [defaultZoom, onZoomChange]);

  const zoomPercentage = Math.round(zoom * 100);
  const containerClassName = `nodrag zoom-controls${className ? ` ${className}` : ""}`;

  return (
    <Box css={styles(theme)} className={containerClassName} role="group" aria-label={t("batch2_18.zoom.controls")}>
      <Tooltip title={t("batch2_18.zoom.out")} placement={tooltipPlacement} enterDelay={TOOLTIP_ENTER_DELAY}>
        <span>
          <IconButton
            className="zoom-button"
            onClick={handleZoomOut}
            disabled={zoom <= minZoom}
            size={buttonSize}
            aria-label={t("batch2_18.zoom.out")}
          >
            <ZoomOutIcon fontSize={buttonSize} />
          </IconButton>
        </span>
      </Tooltip>

      {showValue && (
        <Typography className="zoom-value" component="span">
          {zoomPercentage}%
        </Typography>
      )}

      <Tooltip title={t("batch2_18.zoom.in")} placement={tooltipPlacement} enterDelay={TOOLTIP_ENTER_DELAY}>
        <span>
          <IconButton
            className="zoom-button"
            onClick={handleZoomIn}
            disabled={zoom >= maxZoom}
            size={buttonSize}
            aria-label={t("batch2_18.zoom.in")}
          >
            <ZoomInIcon fontSize={buttonSize} />
          </IconButton>
        </span>
      </Tooltip>

      {showReset && (
        <Tooltip title={t("batch2_18.zoom.reset")} placement={tooltipPlacement} enterDelay={TOOLTIP_ENTER_DELAY}>
          <IconButton
            className="zoom-button"
            onClick={handleReset}
            size={buttonSize}
            aria-label={t("batch2_18.zoom.reset")}
          >
            <RestartAltIcon fontSize={buttonSize} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
});

ZoomControls.displayName = "ZoomControls";

export default ZoomControls;
