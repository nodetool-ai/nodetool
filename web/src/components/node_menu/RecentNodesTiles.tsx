/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import type { DragEvent as ReactDragEvent } from "react";
import { Tooltip, Text, ToolbarIconButton, FlexRow, thinScrollbarStyles } from "../ui_primitives";
import HistoryIcon from "@mui/icons-material/History";
import ClearIcon from "@mui/icons-material/Clear";
import { TOOLTIP_ENTER_DELAY, NOTIFICATION_TIMEOUT_MEDIUM } from "../../config/constants";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useMetadataStore from "../../stores/MetadataStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useCreateNode } from "../../hooks/useCreateNode";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import { useRecentNodesStore } from "../../stores/RecentNodesStore";
import { QUICK_ACTION_BUTTONS } from "./QuickActionTiles";
import { IconForType, colorForType } from "../../config/data_types";

const QUICK_ACTION_NODE_TYPES = new Set(
  QUICK_ACTION_BUTTONS.map((action) => action.nodeType)
);

const tileStyles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "fit-content",
      padding: "0.5em 1em 0.5em 0.5em",
      boxSizing: "border-box"
    },
    ".tiles-header": {
      marginBottom: "0.5em",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 4px",
      "& h5": {
        margin: 0,
        fontSize: "0.85rem",
        fontWeight: 600,
        color: theme.vars.palette.text.secondary,
        textTransform: "uppercase",
        letterSpacing: "1px",
        opacity: 0.8,
        display: "flex",
        alignItems: "center",
        gap: "0.5em"
      }
    },
    ".tiles-container": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
      gridAutoRows: "1fr",
      gap: "8px",
      alignContent: "start",
      overflowY: "auto",
      padding: "6px 2px 2px",
      ...thinScrollbarStyles(theme),
    },
    ".recent-tile": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "12px 8px",
      borderRadius: "var(--rounded-xl)",
      cursor: "pointer",
      position: "relative",
      overflow: "hidden",
      border: `1px solid ${theme.vars.palette.divider}`,
      transition: "all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)",
      minHeight: "64px",
      background: theme.vars.palette.background.paper,
      "&::before": {
        content: '""',
        position: "absolute",
        inset: 0,
        borderRadius: "inherit",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.06), transparent 80%)",
        opacity: 0,
        transition: "opacity 0.3s ease",
        pointerEvents: "none"
      },
      "&:hover": {
        transform: "translateY(-3px)",
        borderColor: theme.vars.palette.primary.main,
        background: theme.vars.palette.action.hover,
        boxShadow: "none",
        "&::before": {
          opacity: 1
        },
        "& .tile-icon": {
          transform: "scale(1.1)"
        },
        "& .tile-label": {
          opacity: 1
        }
      },
      "&:active": {
        transform: "scale(0.97) translateY(0)",
        transition: "all 0.1s ease"
      }
    },
    ".tile-icon": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: "6px",
      transition: "transform 0.3s ease",
      "& svg": {
        fontSize: "1.5rem",
        filter: theme.palette.mode === "dark"
          ? "drop-shadow(0 3px 5px rgba(0,0,0,0.35))"
          : "none"
      }
    },
    ".tile-label": {
      fontSize: "var(--fontSizeNormal)",
      fontWeight: 500,
      textAlign: "center",
      lineHeight: 1.3,
      color: theme.vars.palette.text.primary,
      opacity: 0.9,
      transition: "opacity 0.3s ease",
      maxWidth: "100%",
      overflow: "hidden",
      textOverflow: "ellipsis",
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical"
    },
    ".empty-state": {
      padding: "1em",
      textAlign: "center",
      color: theme.vars.palette.text.secondary,
      fontSize: "0.85rem",
      opacity: 0.6
    },
    ".clear-button": {
      padding: "4px",
      minWidth: 0,
      color: theme.vars.palette.text.secondary,
      "&:hover": {
        color: theme.vars.palette.text.primary,
        backgroundColor: theme.vars.palette.action.hover
      }
    }
  });

const RecentNodesTiles = memo(function RecentNodesTiles() {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => tileStyles(theme), [theme]);

  const { recentNodes, clearRecentNodes } = useRecentNodesStore(
    useShallow((state) => ({
      recentNodes: state.recentNodes,
      clearRecentNodes: state.clearRecentNodes
    }))
  );

  const setDragToCreate = useNodeMenuStore((state) => state.setDragToCreate);
  const setHoveredNode = useNodeMenuStore((state) => state.setHoveredNode);

  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);

  const handleCreateNode = useCreateNode();

  // Use data attributes to avoid creating new function references on each render
  // This is more efficient than curried handlers which create new closures
  const handleDragStart = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      const nodeType = event.currentTarget.dataset.nodeType;
      if (!nodeType) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const metadata = getMetadata(nodeType);
      if (!metadata) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      setDragToCreate(true);
      serializeDragData(
        { type: "create-node", payload: metadata },
        event.dataTransfer
      );
      event.dataTransfer.effectAllowed = "copyMove";
      setActiveDrag({ type: "create-node", payload: metadata });
    },
    [getMetadata, setDragToCreate, setActiveDrag]
  );

  const handleDragEnd = useCallback(() => {
    setDragToCreate(false);
    clearDrag();
  }, [setDragToCreate, clearDrag]);

  const handleTileClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const nodeType = event.currentTarget.dataset.nodeType;
      if (!nodeType) {
        return;
      }

      const metadata = getMetadata(nodeType);
      if (!metadata) {
        console.warn(`Metadata not found for node type: ${nodeType}`);
        addNotification({
          type: "warning",
          content: `Unable to find metadata for ${nodeType}.`,
          timeout: NOTIFICATION_TIMEOUT_MEDIUM
        });
        return;
      }

      handleCreateNode(metadata);
    },
    [getMetadata, addNotification, handleCreateNode]
  );

  const handleTileMouseEnter = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const nodeType = event.currentTarget.dataset.nodeType;
      if (!nodeType) {
        return;
      }

      const metadata = getMetadata(nodeType);
      if (metadata) {
        setHoveredNode(metadata);
      }
    },
    [getMetadata, setHoveredNode]
  );

  const handleClearRecent = useCallback(() => {
    clearRecentNodes();
  }, [clearRecentNodes]);

  // Filter out nodes that are already shown in Quick Actions
  const filteredRecentNodes = useMemo(
    () =>
      recentNodes.filter((node) => !QUICK_ACTION_NODE_TYPES.has(node.nodeType)),
    [recentNodes]
  );

  // Memoize node display names to avoid re-computation on each render
  const nodeDisplayNames = useMemo(
    () => {
      const names = new Map<string, string>();
      filteredRecentNodes.forEach((recentNode) => {
        const { nodeType } = recentNode;
        const metadata = getMetadata(nodeType);
        if (metadata) {
          names.set(
            nodeType,
            metadata.title || metadata.node_type.split(".").pop() || nodeType
          );
        } else {
          names.set(
            nodeType,
            nodeType.split(".").pop() || nodeType
          );
        }
      });
      return names;
    },
    [filteredRecentNodes, getMetadata]
  );

  if (filteredRecentNodes.length === 0) {
    return null;
  }

  return (
    <div css={memoizedStyles}>
      <div className="tiles-header">
        <FlexRow align="center" gap={0.5}>
          <HistoryIcon fontSize="small" sx={{ opacity: 0.8 }} />
          <Text size="normal" weight={600}>Recent Nodes</Text>
        </FlexRow>
        <ToolbarIconButton
          icon={<ClearIcon fontSize="small" />}
          tooltip="Clear recent nodes"
          tooltipPlacement="top"
          size="small"
          className="clear-button"
          onClick={handleClearRecent}
          aria-label="Clear recent nodes"
        />
      </div>
      <div className="tiles-container">
        {filteredRecentNodes.map((recentNode) => {
          const { nodeType } = recentNode;
          const metadata = getMetadata(nodeType);
          const displayName = nodeDisplayNames.get(nodeType) || nodeType;
          const outputType = metadata?.outputs?.[0]?.type?.type || "notype";
          const iconColor = colorForType(outputType);

          return (
            <Tooltip
              key={nodeType}
              title={
                <div>
                  <div>{nodeType}</div>
                  <div
                    style={{
                      fontSize: "0.7rem",
                      opacity: 0.75,
                      marginTop: "4px"
                    }}
                  >
                    Click to place · Drag to canvas
                  </div>
                </div>
              }
              placement="top"
              delay={TOOLTIP_ENTER_DELAY}
              enterNextDelay={TOOLTIP_ENTER_DELAY}
            >
              <div
                className="recent-tile"
                draggable
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onClick={handleTileClick}
                onMouseEnter={handleTileMouseEnter}
                data-node-type={nodeType}
              >
                <div className="tile-icon" style={{ color: iconColor }}>
                  <IconForType
                    iconName={outputType}
                    showTooltip={false}
                    iconSize="normal"
                    svgProps={{ style: { color: iconColor } }}
                  />
                </div>
                <Text className="tile-label">{displayName}</Text>
              </div>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
});

export default memo(RecentNodesTiles);
