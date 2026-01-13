import React, { memo, useCallback } from "react";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { useReactFlow, useViewport } from "@xyflow/react";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import { MIN_ZOOM, MAX_ZOOM } from "../../config/constants";

interface ZoomIndicatorProps {
  visible?: boolean;
}

const ZOOM_STEP = 0.2;

const ZoomIndicator: React.FC<ZoomIndicatorProps> = ({ visible = true }) => {
  const { zoom } = useViewport();
  const reactFlow = useReactFlow();

  const zoomPercentage = Math.round(zoom * 100);

  const handleZoomIn = useCallback(() => {
    const newZoom = Math.min(zoom + ZOOM_STEP, MAX_ZOOM);
    reactFlow.zoomTo(newZoom, { duration: 200 });
  }, [zoom, reactFlow]);

  const handleZoomOut = useCallback(() => {
    const newZoom = Math.max(zoom - ZOOM_STEP, MIN_ZOOM);
    reactFlow.zoomTo(newZoom, { duration: 200 });
  }, [zoom, reactFlow]);

  const handleResetZoom = useCallback(() => {
    reactFlow.zoomTo(1, { duration: 200 });
  }, [reactFlow]);

  const handleFitView = useCallback(() => {
    reactFlow.fitView({ padding: 0.2, duration: 200 });
  }, [reactFlow]);

  if (!visible) {
    return null;
  }

  return (
    <Box
      sx={{
        position: "absolute",
        bottom: 16,
        right: 16,
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        bgcolor: "background.paper",
        borderRadius: 1,
        boxShadow: 2,
        px: 0.5,
        py: 0.25,
        zIndex: 10,
        opacity: 0.9,
        transition: "opacity 0.2s",
        "&:hover": {
          opacity: 1
        }
      }}
    >
      <Tooltip title="Zoom Out" placement="top">
        <span>
          <IconButton
            size="small"
            onClick={handleZoomOut}
            disabled={zoom <= MIN_ZOOM}
            aria-label="Zoom Out"
            sx={{ p: 0.5 }}
          >
            <RemoveIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>

      <Tooltip title="Reset to 100%" placement="top">
        <Typography
          variant="body2"
          onClick={handleResetZoom}
          sx={{
            minWidth: 48,
            textAlign: "center",
            cursor: "pointer",
            userSelect: "none",
            fontWeight: 500,
            fontSize: "0.75rem",
            "&:hover": {
              color: "primary.main"
            }
          }}
        >
          {zoomPercentage}%
        </Typography>
      </Tooltip>

      <Tooltip title="Zoom In" placement="top">
        <span>
          <IconButton
            size="small"
            onClick={handleZoomIn}
            disabled={zoom >= MAX_ZOOM}
            aria-label="Zoom In"
            sx={{ p: 0.5 }}
          >
            <AddIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>

      <Box sx={{ width: 1, height: 16, bgcolor: "divider", mx: 0.5 }} />

      <Tooltip title="Fit All Nodes (F)" placement="top">
        <IconButton size="small" onClick={handleFitView} sx={{ p: 0.5 }}>
          <CenterFocusStrongIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

export default memo(ZoomIndicator);
