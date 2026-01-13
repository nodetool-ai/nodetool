/** @jsxImportSource @emotion/react */
import { memo, useCallback } from "react";
import { Box, ButtonGroup, Button, Tooltip } from "@mui/material";
import { useReactFlow, useViewport } from "@xyflow/react";
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const ZOOM_PRESETS = [0.5, 1, 1.5, 2] as const;

const styles = (theme: Theme) =>
  css({
    position: "absolute",
    bottom: "20px",
    left: "20px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    backgroundColor: `${theme.vars.palette.grey[900]}ee`,
    borderRadius: "8px",
    padding: "4px 8px",
    border: `1px solid ${theme.vars.palette.grey[700]}`,
    backdropFilter: "blur(8px)",
    zIndex: 10,
    ".zoom-display": {
      fontFamily: "var(--fontFamily2)",
      fontSize: "12px",
      fontWeight: 600,
      color: theme.vars.palette.grey[300],
      minWidth: "48px",
      textAlign: "center",
      userSelect: "none"
    },
    ".zoom-button": {
      minWidth: "28px",
      height: "28px",
      padding: "2px",
      fontSize: "11px",
      color: theme.vars.palette.grey[400],
      backgroundColor: "transparent",
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[800],
        color: theme.vars.palette.grey[200],
        borderColor: theme.vars.palette.grey[600]
      },
      "&.active": {
        backgroundColor: theme.vars.palette.primary.dark,
        color: theme.vars.palette.primary.contrastText,
        borderColor: theme.vars.palette.primary.main
      }
    },
    ".icon-button": {
      minWidth: "28px",
      height: "28px",
      padding: "4px"
    },
    ".MuiButtonGroup-root": {
      "& .MuiButton-root": {
        borderColor: theme.vars.palette.grey[700]
      }
    }
  });

interface ZoomLevelIndicatorProps {
  className?: string;
}

const ZoomLevelIndicator: React.FC<ZoomLevelIndicatorProps> = ({
  className
}) => {
  const { zoom } = useViewport();
  const { zoomTo, fitView, zoomIn, zoomOut } = useReactFlow();

  const handleZoomPreset = useCallback(
    (level: number) => {
      zoomTo(level, { duration: 200 });
    },
    [zoomTo]
  );

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2, duration: 200 });
  }, [fitView]);

  const handleZoomIn = useCallback(() => {
    zoomIn({ duration: 100 });
  }, [zoomIn]);

  const handleZoomOut = useCallback(() => {
    zoomOut({ duration: 100 });
  }, [zoomOut]);

  const zoomPercentage = Math.round(zoom * 100);

  const isActivePreset = (preset: number): boolean => {
    return Math.abs(zoom - preset) < 0.05;
  };

  return (
    <Box css={styles} className={className}>
      <Tooltip title="Zoom Out" enterDelay={TOOLTIP_ENTER_DELAY}>
        <Button
          className="zoom-button icon-button"
          onClick={handleZoomOut}
          size="small"
          aria-label="Zoom out"
        >
          <ZoomOutIcon fontSize="small" />
        </Button>
      </Tooltip>

      <span className="zoom-display">{zoomPercentage}%</span>

      <Tooltip title="Zoom In" enterDelay={TOOLTIP_ENTER_DELAY}>
        <Button
          className="zoom-button icon-button"
          onClick={handleZoomIn}
          size="small"
          aria-label="Zoom in"
        >
          <ZoomInIcon fontSize="small" />
        </Button>
      </Tooltip>

      <ButtonGroup size="small" variant="outlined">
        {ZOOM_PRESETS.map((preset) => (
          <Tooltip
            key={preset}
            title={`Zoom to ${preset * 100}%`}
            enterDelay={TOOLTIP_ENTER_DELAY}
          >
            <Button
              className={`zoom-button ${isActivePreset(preset) ? "active" : ""}`}
              onClick={() => handleZoomPreset(preset)}
              aria-label={`Zoom to ${preset * 100}%`}
            >
              {preset * 100}%
            </Button>
          </Tooltip>
        ))}
      </ButtonGroup>

      <Tooltip title="Fit to View" enterDelay={TOOLTIP_ENTER_DELAY}>
        <Button
          className="zoom-button icon-button"
          onClick={handleFitView}
          size="small"
          aria-label="Fit view"
        >
          <FitScreenIcon fontSize="small" />
        </Button>
      </Tooltip>
    </Box>
  );
};

export default memo(ZoomLevelIndicator);
