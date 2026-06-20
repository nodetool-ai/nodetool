import { memo, useCallback, useMemo, useState, useEffect, useRef } from "react";
import {
  ListItemButton,
  ListItemText
} from "@mui/material";
import { Tooltip, ToolbarIconButton, Text, FlexRow, Box, Popover, ListGroup, MOTION, BORDER_RADIUS } from "../ui_primitives";
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
const ZOOM_CHANGE_THRESHOLD = 0.001;

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
  const prevZoomRef = useRef<number | null>(null);

  // Detect zoom changes and show the panel
  useEffect(() => {
    // Skip showing on initial render (prevZoomRef is null)
    if (prevZoomRef.current !== null && Math.abs(zoom - prevZoomRef.current) > ZOOM_CHANGE_THRESHOLD) {
      setIsZooming(true);
      
      // Clear any existing timeout
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
      
      // Set a new timeout to hide the panel
      hideTimeoutRef.current = setTimeout(() => {
        setIsZooming(false);
      }, HIDE_DELAY_MS);
    }
    
    prevZoomRef.current = zoom;
    
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

  const handlePresetClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const presetValue = event.currentTarget.dataset.preset;
    if (presetValue) {
      const preset = parseFloat(presetValue) as ZoomPreset;
      handlePresetZoom(preset);
    }
  }, [handlePresetZoom]);

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

  const zoomButtonSx = useMemo(
    () => ({
      padding: "2px",
      color: theme.vars.palette.text.secondary,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        color: theme.palette.primary.main
      }
    }),
    [theme.vars.palette.text.secondary, theme.vars.palette.action.hover, theme.palette.primary.main]
  );

  const zoomLabelSx = useMemo(
    () => ({
      background: "none",
      border: "none",
      cursor: "pointer",
      fontFamily: "JetBrains Mono, monospace",
      fontSize: "var(--fontSizeSmall)",
      fontWeight: 500,
      color: currentPreset
        ? theme.palette.primary.main
        : theme.vars.palette.text.secondary,
      minWidth: "48px",
      textAlign: "center" as const,
      padding: "2px 6px",
      borderRadius: BORDER_RADIUS.sm,
      transition: `all ${MOTION.fast}`,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        color: theme.palette.primary.main
      }
    }),
    [currentPreset, theme.palette.primary.main, theme.vars.palette.text.secondary, theme.vars.palette.action.hover]
  );

  // Keep the popover open even when not zooming
  const shouldShowPanel = isZooming || Boolean(zoomMenuAnchor);

  const containerSx = useMemo(
    () => ({
      position: "absolute" as const,
      bottom: 16,
      right: 20,
      zIndex: 10,
      backgroundColor: theme.vars.palette.Paper.paper,
      backdropFilter: "blur(8px)",
      borderRadius: BORDER_RADIUS.lg,
      border: `1px solid ${theme.vars.palette.divider}`,
      padding: "4px 8px",
      boxShadow: theme.shadows[4],
      userSelect: "none" as const,
      pointerEvents: shouldShowPanel ? ("auto" as const) : ("none" as const),
      opacity: shouldShowPanel ? 1 : 0,
      transition: "opacity 0.2s ease-in-out"
    }),
    [shouldShowPanel, theme.vars.palette.Paper.paper, theme.vars.palette.divider, theme.shadows]
  );

  if (!visible) {
    return null;
  }

  return (
    <>
      <FlexRow
        data-testid="viewport-status-indicator"
        gap={0.5}
        align="center"
        sx={containerSx}
      >
        <ToolbarIconButton
          icon={<RemoveIcon sx={{ fontSize: "var(--fontSizeNormal)" }} />}
          tooltip={getShortcutTooltip("zoomOut")}
          tooltipPlacement="top"
          onClick={handleZoomOut}
          size="small"
          sx={zoomButtonSx}
        />

        <Tooltip
          title={
            <Box>
              <Box>{getShortcutTooltip("resetZoom")}</Box>
              <Box sx={{ mt: 0.5, fontSize: "var(--fontSizeSmaller)", opacity: 0.8 }}>
                Click for zoom presets
              </Box>
            </Box>
          }
          placement="top"
        >
          <Text
            component="button"
            onClick={handleOpenZoomMenu}
            sx={zoomLabelSx}
          >
            {zoomPercentage}%
          </Text>
        </Tooltip>

        <ToolbarIconButton
          icon={<AddIcon sx={{ fontSize: "var(--fontSizeNormal)" }} />}
          tooltip={getShortcutTooltip("zoomIn")}
          tooltipPlacement="top"
          onClick={handleZoomIn}
          size="small"
          sx={zoomButtonSx}
        />

        <Box
          sx={{
            width: "1px",
            height: "16px",
            backgroundColor: theme.vars.palette.divider,
            mx: 0.5
          }}
        />

        <ToolbarIconButton
          icon={<CenterFocusStrongIcon sx={{ fontSize: "var(--fontSizeNormal)" }} />}
          tooltip={getShortcutTooltip("fitView")}
          tooltipPlacement="top"
          onClick={handleFitView}
          size="small"
          sx={zoomButtonSx}
        />
      </FlexRow>

      <Popover
        open={Boolean(zoomMenuAnchor)}
        anchorEl={zoomMenuAnchor}
        onClose={handleCloseZoomMenu}
        placement="top-center"
        paperSx={{
          minWidth: 120,
          py: 0.5
        }}
      >
        <ListGroup compact flush>
          {ZOOM_PRESETS.map((preset) => (
            <ListItemButton
              key={preset}
              onClick={handlePresetClick}
              data-preset={preset.toString()}
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
                  fontSize: "var(--fontSizeSmall)",
                  fontFamily: "JetBrains Mono, monospace",
                  textAlign: "center"
                }}
              />
            </ListItemButton>
          ))}
        </ListGroup>
      </Popover>
    </>
  );
};

export default memo(ViewportStatusIndicator);
