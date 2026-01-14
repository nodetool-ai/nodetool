import { memo, useCallback, useMemo } from "react";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { useViewport, useReactFlow } from "@xyflow/react";
import { useTheme } from "@mui/material/styles";
import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import GridOnIcon from "@mui/icons-material/GridOn";
import GridOffIcon from "@mui/icons-material/GridOff";
import SettingsIcon from "@mui/icons-material/Settings";
import { useNodes } from "../../contexts/NodeContext";
import { getShortcutTooltip } from "../../config/shortcuts";
import { useGridSettingsStore } from "../../stores/GridSettingsStore";

interface ViewportStatusIndicatorProps {
  visible?: boolean;
}

const ViewportStatusIndicator: React.FC<ViewportStatusIndicatorProps> = ({
  visible = true
}) => {
  const theme = useTheme();
  const { zoom } = useViewport();
  const { zoomTo, fitView } = useReactFlow();
  const nodes = useNodes((state) => state.nodes);
  const { gridSettings, setGridVisible, togglePanel } = useGridSettingsStore();

  const zoomPercentage = useMemo(() => Math.round(zoom * 100), [zoom]);

  const nodeCount = useMemo(() => nodes.length, [nodes]);

  const selectedCount = useMemo(
    () => nodes.filter((n) => n.selected).length,
    [nodes]
  );

  const handleResetZoom = useCallback(() => {
    zoomTo(1, { duration: 200 });
  }, [zoomTo]);

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2, duration: 200 });
  }, [fitView]);

  const handleToggleGrid = useCallback(() => {
    setGridVisible(!gridSettings.visible);
  }, [gridSettings.visible, setGridVisible]);

  const handleOpenGridSettings = useCallback((_event: React.MouseEvent) => {
    togglePanel();
  }, [togglePanel]);

  if (!visible) {
    return null;
  }

  return (
    <Box
      sx={{
        position: "absolute",
        bottom: 16,
        right: 20,
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        backgroundColor: theme.vars.palette.background.paper,
        backdropFilter: "blur(8px)",
        borderRadius: "8px",
        border: `1px solid ${theme.vars.palette.divider}`,
        padding: "4px 8px",
        boxShadow: theme.shadows[4],
        userSelect: "none",
        pointerEvents: "auto"
      }}
    >
      <Tooltip
        title={getShortcutTooltip("resetZoom")}
        placement="top"
        arrow
      >
        <Typography
          component="button"
          onClick={handleResetZoom}
          sx={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: "0.75rem",
            fontWeight: 500,
            color: theme.vars.palette.text.secondary,
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

      <Box
        sx={{
          width: "1px",
          height: "16px",
          backgroundColor: theme.vars.palette.divider
        }}
      />

      <Tooltip title="Fit view" placement="top" arrow>
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

      <Box
        sx={{
          width: "1px",
          height: "16px",
          backgroundColor: theme.vars.palette.divider
        }}
      />

      <Tooltip title={gridSettings.visible ? "Hide grid" : "Show grid"} placement="top" arrow>
        <IconButton
          onClick={handleToggleGrid}
          size="small"
          sx={{
            padding: "2px",
            color: gridSettings.visible
              ? theme.palette.primary.main
              : theme.vars.palette.text.secondary,
            "&:hover": {
              backgroundColor: theme.vars.palette.action.hover
            }
          }}
        >
          {gridSettings.visible ? (
            <GridOnIcon sx={{ fontSize: "1rem" }} />
          ) : (
            <GridOffIcon sx={{ fontSize: "1rem" }} />
          )}
        </IconButton>
      </Tooltip>

      <Tooltip title="Grid settings" placement="top" arrow>
        <IconButton
          onClick={handleOpenGridSettings}
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
          <SettingsIcon sx={{ fontSize: "1rem" }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

export default memo(ViewportStatusIndicator);
