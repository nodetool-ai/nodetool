import { memo, useCallback, useMemo } from "react";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { useViewport, useReactFlow } from "@xyflow/react";
import { useTheme } from "@mui/material/styles";
import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import { useNodes } from "../../contexts/NodeContext";
import { getShortcutTooltip } from "../../config/shortcuts";

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
        backgroundColor: theme.palette.mode === "dark"
          ? "rgba(15, 23, 42, 0.85)"
          : "rgba(255, 255, 255, 0.9)",
        backdropFilter: "blur(8px)",
        borderRadius: "8px",
        border: `1px solid ${
          theme.palette.mode === "dark"
            ? "rgba(148, 163, 184, 0.15)"
            : "rgba(0, 0, 0, 0.08)"
        }`,
        padding: "4px 8px",
        boxShadow: theme.palette.mode === "dark"
          ? "0 4px 12px rgba(0, 0, 0, 0.3)"
          : "0 2px 8px rgba(0, 0, 0, 0.08)",
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
            color: theme.palette.mode === "dark"
              ? "rgba(148, 163, 184, 0.9)"
              : "rgba(71, 85, 105, 0.9)",
            minWidth: "48px",
            textAlign: "center",
            padding: "2px 6px",
            borderRadius: "4px",
            transition: "all 0.15s ease",
            "&:hover": {
              backgroundColor: theme.palette.mode === "dark"
                ? "rgba(148, 163, 184, 0.1)"
                : "rgba(0, 0, 0, 0.05)",
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
          backgroundColor: theme.palette.mode === "dark"
            ? "rgba(148, 163, 184, 0.2)"
            : "rgba(0, 0, 0, 0.1)"
        }}
      />

      <Tooltip
        title={
          selectedCount > 0
            ? `${selectedCount} of ${nodeCount} nodes selected`
            : `${nodeCount} nodes in workflow`
        }
        placement="top"
        arrow
      >
        <Typography
          sx={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: "0.75rem",
            fontWeight: 500,
            color: theme.palette.mode === "dark"
              ? "rgba(148, 163, 184, 0.9)"
              : "rgba(71, 85, 105, 0.9)",
            padding: "2px 6px"
          }}
        >
          {selectedCount > 0 ? `${selectedCount}/${nodeCount}` : nodeCount}
        </Typography>
      </Tooltip>

      <Box
        sx={{
          width: "1px",
          height: "16px",
          backgroundColor: theme.palette.mode === "dark"
            ? "rgba(148, 163, 184, 0.2)"
            : "rgba(0, 0, 0, 0.1)"
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
            color: theme.palette.mode === "dark"
              ? "rgba(148, 163, 184, 0.9)"
              : "rgba(71, 85, 105, 0.9)",
            "&:hover": {
              backgroundColor: theme.palette.mode === "dark"
                ? "rgba(148, 163, 184, 0.1)"
                : "rgba(0, 0, 0, 0.05)",
              color: theme.palette.primary.main
            }
          }}
        >
          <CenterFocusStrongIcon sx={{ fontSize: "1rem" }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

export default memo(ViewportStatusIndicator);
