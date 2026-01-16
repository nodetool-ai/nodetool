/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo } from "react";
import { Box, IconButton, Typography, Tooltip } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import { useMiniMapStore } from "../../stores/MiniMapStore";

const controlStyles = (theme: Theme) =>
  css({
    "&.minimap-zoom-controls": {
      position: "absolute",
      bottom: "0",
      left: "0",
      right: "0",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "4px",
      padding: "8px",
      backgroundColor: theme.palette.mode === "dark"
        ? "rgba(30, 30, 30, 0.9)"
        : "rgba(255, 255, 255, 0.9)",
      borderTop: `1px solid ${
        theme.palette.mode === "dark"
          ? "rgba(255, 255, 255, 0.1)"
          : "rgba(0, 0, 0, 0.1)"
      }`,
      borderRadius: "0 0 8px 8px",
      zIndex: 11
    },
    "& .zoom-buttons": {
      display: "flex",
      alignItems: "center",
      gap: "4px"
    },
    "& .zoom-button": {
      width: "28px",
      height: "28px",
      minWidth: "28px",
      padding: "4px",
      borderRadius: "6px",
      backgroundColor: theme.palette.mode === "dark"
        ? "rgba(255, 255, 255, 0.08)"
        : "rgba(0, 0, 0, 0.04)",
      color: theme.palette.text.primary,
      "&:hover": {
        backgroundColor: theme.palette.mode === "dark"
          ? "rgba(255, 255, 255, 0.15)"
          : "rgba(0, 0, 0, 0.08)"
      },
      "&:disabled": {
        opacity: 0.4,
        backgroundColor: "transparent"
      }
    },
    "& .zoom-indicator": {
      padding: "2px 8px",
      fontSize: "11px",
      fontWeight: 500,
      fontFamily: theme.fontFamily2,
      color: theme.palette.text.secondary,
      minWidth: "40px",
      textAlign: "center"
    },
    "& .reset-button": {
      position: "absolute",
      right: "8px",
      bottom: "50%",
      transform: "translateY(50%)",
      width: "24px",
      height: "24px",
      minWidth: "24px",
      padding: "4px",
      opacity: 0.6,
      "&:hover": {
        opacity: 1
      }
    }
  });

interface MiniMapZoomControlsProps {
  onZoomChange?: (zoom: number) => void;
}

const MiniMapZoomControls: React.FC<MiniMapZoomControlsProps> = memo(
  function MiniMapZoomControls({ onZoomChange }) {
    const theme = useTheme();
    const memoizedStyles = useMemo(() => controlStyles(theme), [theme]);

    const zoomLevel = useMiniMapStore((state) => state.zoomLevel);
    const zoomIn = useMiniMapStore((state) => state.zoomIn);
    const zoomOut = useMiniMapStore((state) => state.zoomOut);
    const resetZoom = useMiniMapStore((state) => state.resetZoom);

    const handleZoomIn = useCallback(() => {
      zoomIn();
      onZoomChange?.(useMiniMapStore.getState().zoomLevel);
    }, [zoomIn, onZoomChange]);

    const handleZoomOut = useCallback(() => {
      zoomOut();
      onZoomChange?.(useMiniMapStore.getState().zoomLevel);
    }, [zoomOut, onZoomChange]);

    const handleReset = useCallback(() => {
      resetZoom();
      onZoomChange?.(useMiniMapStore.getState().zoomLevel);
    }, [resetZoom, onZoomChange]);

    const zoomPercentage = Math.round(zoomLevel * 100);

    return (
      <Box css={memoizedStyles} className="minimap-zoom-controls">
        <Box className="zoom-buttons">
          <Tooltip title="Zoom Out" placement="top">
            <IconButton
              className="zoom-button"
              onClick={handleZoomOut}
              size="small"
              disabled={zoomLevel <= 0.5}
              aria-label="Zoom out minimap"
            >
              <RemoveIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Typography className="zoom-indicator" variant="caption">
            {zoomPercentage}%
          </Typography>
          <Tooltip title="Zoom In" placement="top">
            <IconButton
              className="zoom-button"
              onClick={handleZoomIn}
              size="small"
              disabled={zoomLevel >= 2}
              aria-label="Zoom in minimap"
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <Tooltip title="Reset Zoom" placement="top">
          <IconButton
            className="reset-button"
            onClick={handleReset}
            size="small"
            aria-label="Reset minimap zoom"
          >
            <CenterFocusStrongIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    );
  }
);

export default MiniMapZoomControls;
