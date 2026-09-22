import { memo, useCallback, useMemo, useState } from "react";

import {
  Tooltip,
  ToolbarIconButton,
  Text,
  FlexRow,
  Box,
  Popover,
  ListGroup,
  MOTION,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx,
  ListItemButton,
  ListItemText,
  Z_INDEX,
  reducedMotion
} from "../ui_primitives";
import { useStore, useReactFlow } from "@xyflow/react";
import { useTheme } from "@mui/material/styles";
import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import FilterCenterFocusIcon from "@mui/icons-material/FilterCenterFocus";
import LabelOutlinedIcon from "@mui/icons-material/LabelOutlined";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import { getShortcutTooltip } from "../../config/shortcuts";

interface ViewportStatusIndicatorProps {
  visible?: boolean;
  showPortLabels?: boolean;
  onTogglePortLabels?: () => void;
}

const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.5, 2] as const;
type ZoomPreset = (typeof ZOOM_PRESETS)[number];

const ViewportStatusIndicator: React.FC<ViewportStatusIndicatorProps> = ({
  visible = true,
  showPortLabels = false,
  onTogglePortLabels
}) => {
  const theme = useTheme();
  const zoom = useStore((s) => s.transform[2]);
  const { zoomTo, fitView, getNodes } = useReactFlow();
  const [zoomMenuAnchor, setZoomMenuAnchor] = useState<HTMLElement | null>(
    null
  );
  const zoomPercentage = useMemo(() => Math.round(zoom * 100), [zoom]);

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2, duration: 200 });
  }, [fitView]);

  const handleFitSelection = useCallback(() => {
    const selectedNodes = getNodes().filter((node) => node.selected);
    if (selectedNodes.length === 0) {
      fitView({ padding: 0.2, duration: 200 });
      return;
    }
    fitView({ nodes: selectedNodes, padding: 0.2, duration: 200 });
  }, [fitView, getNodes]);

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
      padding: getSpacingPx(SPACING.micro),
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
      padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.sm)}`,
      borderRadius: BORDER_RADIUS.sm,
      transition: `all ${MOTION.fast}`,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        color: theme.palette.primary.main
      }
    }),
    [currentPreset, theme.palette.primary.main, theme.vars.palette.text.secondary, theme.vars.palette.action.hover]
  );

  const containerSx = useMemo(
    () => ({
      position: "absolute" as const,
      bottom: getSpacingPx(SPACING.xl),
      right: getSpacingPx(SPACING.xl),
      zIndex: Z_INDEX.dropdown,
      backgroundColor: theme.vars.palette.Paper.paper,
      backdropFilter: "blur(8px)",
      borderRadius: BORDER_RADIUS.lg,
      border: `1px solid ${theme.vars.palette.divider}`,
      padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.md)}`,
      boxShadow: theme.shadows[4],
      userSelect: "none" as const,
      pointerEvents: "auto" as const,
      opacity: 1,
      transition: MOTION.opacity,
      ...reducedMotion({ transition: MOTION.none })
    }),
    [theme.vars.palette.Paper.paper, theme.vars.palette.divider, theme.shadows]
  );

  if (!visible) {
    return null;
  }

  return (
    <>
      <FlexRow
        data-testid="viewport-status-indicator"
        gap={SPACING.micro}
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
            mx: SPACING.micro
          }}
        />

        <ToolbarIconButton
          icon={<CenterFocusStrongIcon sx={{ fontSize: "var(--fontSizeNormal)" }} />}
          tooltip={`Fit all · ${getShortcutTooltip("fitView")}`}
          tooltipPlacement="top"
          onClick={handleFitView}
          size="small"
          sx={zoomButtonSx}
        />

        <ToolbarIconButton
          icon={<FilterCenterFocusIcon sx={{ fontSize: "var(--fontSizeNormal)" }} />}
          tooltip="Fit selection"
          tooltipPlacement="top"
          onClick={handleFitSelection}
          size="small"
          sx={zoomButtonSx}
        />

        {onTogglePortLabels ? (
          <ToolbarIconButton
            icon={<LabelOutlinedIcon sx={{ fontSize: "var(--fontSizeNormal)" }} />}
            tooltip={showPortLabels ? "Hide port labels" : "Show port labels"}
            tooltipPlacement="top"
            onClick={onTogglePortLabels}
            ariaLabel={showPortLabels ? "Hide port labels" : "Show port labels"}
            aria-pressed={showPortLabels}
            size="small"
            sx={zoomButtonSx}
          />
        ) : null}
      </FlexRow>

      <Popover
        open={Boolean(zoomMenuAnchor)}
        anchorEl={zoomMenuAnchor}
        onClose={handleCloseZoomMenu}
        placement="top-center"
        paperSx={{
          minWidth: 120,
          py: SPACING.micro
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
                py: SPACING.micro,
                px: SPACING.md,
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
