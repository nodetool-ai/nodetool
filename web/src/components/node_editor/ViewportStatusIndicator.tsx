import { memo, useCallback, useMemo, useState, useEffect, useRef } from "react";
import {
  Box,
  IconButton,
  Tooltip,
  Typography,
  Popover,
  List,
  ListItemButton,
  ListItemText
} from "@mui/material";
import { useViewport, useReactFlow } from "@xyflow/react";
import { useTheme } from "@mui/material/styles";
import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import { getShortcutTooltip } from "../../config/shortcuts";

interface ViewportStatusIndicatorProps {
  visible?: boolean;
}

const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.5, 2] as const;
const HIDE_DELAY_MS = 1500;

type ZoomPreset = (typeof ZOOM_PRESETS)[number];

const ViewportStatusIndicator: React.FC<ViewportStatusIndicatorProps> = ({
  visible = true
}) => {
  const theme = useTheme();
  const { zoom } = useViewport();
  const { zoomTo, fitView } = useReactFlow();
  const [zoomMenuAnchor, setZoomMenuAnchor] = useState<HTMLElement | null>(
    null
  );
  const [isZooming, setIsZooming] = useState(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevZoomRef = useRef<number>(zoom);

  // Detect zoom changes and show the panel
  useEffect(() => {
    if (Math.abs(zoom - prevZoomRef.current) > 0.001) {
      setIsZooming(true);
      
      // Clear any existing timeout
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
      
      // Set a new timeout to hide the panel
      hideTimeoutRef.current = setTimeout(() => {
        setIsZooming(false);
      }, HIDE_DELAY_MS);
      
      prevZoomRef.current = zoom;
    }
    
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [zoom]);

  const zoomPercentage = useMemo(() => Math.round(zoom * 100), [zoom]);

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2, duration: 200 });
  }, [fitView]);

  const handleZoomIn = useCallback(() => {
    zoomTo(Math.min(zoom * 1.2, 5), { duration: 100 });
  }, [zoomTo, zoom]);

  const handleZoomOut = useCallback(() => {
    zoomTo(Math.max(zoom / 1.2, 0.1), { duration: 100 });
  }, [zoomTo, zoom]);

  const handlePresetZoom = useCallback(
    (presetZoom: ZoomPreset) => {
      zoomTo(presetZoom, { duration: 200 });
      setZoomMenuAnchor(null);
    },
    [zoomTo]
  );

  const handleOpenZoomMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      setZoomMenuAnchor(event.currentTarget);
    },
    []
  );

  const handleCloseZoomMenu = useCallback(() => {
    setZoomMenuAnchor(null);
  }, []);

  const isZoomPreset = useCallback(
    (value: number): value is ZoomPreset =>
      ZOOM_PRESETS.some((preset) => Math.abs(preset - value) < 0.01),
    []
  );

  const currentPreset = useMemo(
    () => (isZoomPreset(zoom) ? zoom : null),
    [zoom, isZoomPreset]
  );

  // Keep the popover open even when not zooming
  const shouldShowPanel = isZooming || Boolean(zoomMenuAnchor);

  if (!visible) {
    return null;
  }

  return (
    <>
      <Box
        sx={{
          position: "absolute",
          bottom: 16,
          right: 20,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          backgroundColor: theme.vars.palette.Paper.paper,
          backdropFilter: "blur(8px)",
          borderRadius: "8px",
          border: `1px solid ${theme.vars.palette.divider}`,
          padding: "4px 8px",
          boxShadow: theme.shadows[4],
          userSelect: "none",
          pointerEvents: shouldShowPanel ? "auto" : "none",
          opacity: shouldShowPanel ? 1 : 0,
          transition: "opacity 0.2s ease-in-out"
        }}
      >
        <Tooltip title={getShortcutTooltip("zoomOut")} placement="top" arrow>
          <IconButton
            onClick={handleZoomOut}
            size="small"
            sx={{
              padding: "2px",
              color: theme.vars.palette.text.secondary,
              "&:hover": {
                backgroundColor: theme.vars.palette.action.hover,
                color: theme.palette.primary.main
              }
            }}
          >
            <RemoveIcon sx={{ fontSize: "1rem" }} />
          </IconButton>
        </Tooltip>

        <Tooltip
          title={
            <Box>
              <Box>{getShortcutTooltip("resetZoom")}</Box>
              <Box sx={{ mt: 0.5, fontSize: "0.7rem", opacity: 0.8 }}>
                Click for zoom presets
              </Box>
            </Box>
          }
          placement="top"
          arrow
        >
          <Typography
            component="button"
            onClick={handleOpenZoomMenu}
            sx={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "JetBrains Mono, monospace",
              fontSize: "0.75rem",
              fontWeight: 500,
              color: currentPreset
                ? theme.palette.primary.main
                : theme.vars.palette.text.secondary,
              minWidth: "48px",
              textAlign: "center",
              padding: "2px 6px",
              borderRadius: "4px",
              transition: "all 0.15s ease",
              "&:hover": {
                backgroundColor: theme.vars.palette.action.hover,
                color: theme.palette.primary.main
              }
            }}
          >
            {zoomPercentage}%
          </Typography>
        </Tooltip>

        <Tooltip title={getShortcutTooltip("zoomIn")} placement="top" arrow>
          <IconButton
            onClick={handleZoomIn}
            size="small"
            sx={{
              padding: "2px",
              color: theme.vars.palette.text.secondary,
              "&:hover": {
                backgroundColor: theme.vars.palette.action.hover,
                color: theme.palette.primary.main
              }
            }}
          >
            <AddIcon sx={{ fontSize: "1rem" }} />
          </IconButton>
        </Tooltip>

        <Box
          sx={{
            width: "1px",
            height: "16px",
            backgroundColor: theme.vars.palette.divider,
            mx: 0.5
          }}
        />

        <Tooltip
          title={getShortcutTooltip("fitView")}
          placement="top"
          arrow
        >
          <IconButton
            onClick={handleFitView}
            size="small"
            sx={{
              padding: "2px",
              color: theme.vars.palette.text.secondary,
              "&:hover": {
                backgroundColor: theme.vars.palette.action.hover,
                color: theme.palette.primary.main
              }
            }}
          >
            <CenterFocusStrongIcon sx={{ fontSize: "1rem" }} />
          </IconButton>
        </Tooltip>
      </Box>

      <Popover
        open={Boolean(zoomMenuAnchor)}
        anchorEl={zoomMenuAnchor}
        onClose={handleCloseZoomMenu}
        anchorOrigin={{
          vertical: "top",
          horizontal: "center"
        }}
        transformOrigin={{
          vertical: "bottom",
          horizontal: "center"
        }}
        PaperProps={{
          sx: {
            minWidth: 120,
            py: 0.5
          }
        }}
      >
        <List dense disablePadding>
          {ZOOM_PRESETS.map((preset) => (
            <ListItemButton
              key={preset}
              onClick={() => handlePresetZoom(preset)}
              selected={Math.abs(zoom - preset) < 0.01}
              sx={{
                py: 0.5,
                px: 2,
                "&.Mui-selected": {
                  backgroundColor: theme.vars.palette.action.selected,
                  "&:hover": {
                    backgroundColor: theme.vars.palette.action.selected
                  }
                }
              }}
            >
              <ListItemText
                primary={`${Math.round(preset * 100)}%`}
                primaryTypographyProps={{
                  fontSize: "0.8rem",
                  fontFamily: "JetBrains Mono, monospace",
                  textAlign: "center"
                }}
              />
            </ListItemButton>
          ))}
        </List>
      </Popover>
    </>
  );
};

export default memo(ViewportStatusIndicator);
