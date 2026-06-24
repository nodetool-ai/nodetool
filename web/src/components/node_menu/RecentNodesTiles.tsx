/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useShallow } from "zustand/react/shallow";
import type { DragEvent as ReactDragEvent } from "react";
import { Tooltip, Text, ToolbarIconButton, thinScrollbarStyles, MOTION, BORDER_RADIUS, SPACING, getSpacingPx } from "../ui_primitives";
import ClearIcon from "@mui/icons-material/Clear";
import { TOOLTIP_ENTER_DELAY, NOTIFICATION_TIMEOUT_MEDIUM } from "../../config/constants";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useMetadataStore from "../../stores/MetadataStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import usePendingNodeCreateStore from "../../stores/PendingNodeCreateStore";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import { useRecentNodesStore } from "../../stores/RecentNodesStore";
import { QUICK_ACTION_BUTTONS } from "./QuickActionTiles.constants";
import { colorForType } from "../../config/data_types";
import { IconForType } from "../../config/IconForType";

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
      marginBottom: "0.25em",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: `0 ${getSpacingPx(SPACING.xs)}`,
      "& h5": {
        margin: 0,
        fontSize: "var(--fontSizeNormal)",
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
      gridTemplateColumns: "repeat(auto-fill, minmax(116px, 1fr))",
      gridAutoRows: "1fr",
      gap: getSpacingPx(SPACING.sm),
      alignContent: "start",
      overflowY: "auto",
      padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.micro)}`,
      ...thinScrollbarStyles(theme),
    },
    ".recent-tile": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.sm)}`,
      borderRadius: BORDER_RADIUS.xl,
      cursor: "pointer",
      position: "relative",
      overflow: "hidden",
      border: `1px solid ${theme.vars.palette.divider}`,
      transition: `all ${MOTION.slow}`,
      minHeight: "46px",
      background: theme.vars.palette.background.paper,
      "&::before": {
        content: '""',
        position: "absolute",
        inset: 0,
        borderRadius: "inherit",
        background:
          `linear-gradient(180deg, ${theme.vars.palette.c_overlay}, transparent 80%)`,
        opacity: 0,
        transition: `opacity ${MOTION.slow}`,
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
        transition: `all ${MOTION.fast}`
      }
    },
    ".tile-icon": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: getSpacingPx(SPACING.xs),
      transition: `transform ${MOTION.slow}`,
      "& svg": {
        fontSize: "var(--fontSizeBig)",
        filter: theme.palette.mode === "dark"
          ? `drop-shadow(0 3px 5px ${theme.vars.palette.c_scrim_soft})`
          : "none"
      }
    },
    ".tile-label": {
      fontSize: "var(--fontSizeSmall)",
      fontWeight: 500,
      textAlign: "center",
      lineHeight: 1.3,
      color: theme.vars.palette.text.primary,
      opacity: 0.9,
      transition: `opacity ${MOTION.slow}`,
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
      fontSize: "var(--fontSizeNormal)",
      opacity: 0.6
    },
    ".clear-button": {
      padding: getSpacingPx(SPACING.xs),
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

  // Route click-to-add via PendingNodeCreateStore so this component can be
  // rendered outside the workflow editor's ReactFlowProvider (e.g. from the
  // left-panel Search view). The `<NodeCreateBridge />` inside the active
  // tab's ReactFlowProvider consumes the request.
  const requestCreate = usePendingNodeCreateStore((s) => s.requestCreate);

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

      requestCreate(metadata);
    },
    [getMetadata, addNotification, requestCreate]
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
        <Text size="normal" weight={600}>Recent Nodes</Text>
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
                      fontSize: "var(--fontSizeSmaller)",
                      opacity: 0.75,
                      marginTop: getSpacingPx(SPACING.xs)
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
                role="button"
                tabIndex={0}
                draggable
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onClick={handleTileClick}
                onKeyDown={(e: ReactKeyboardEvent<HTMLDivElement>) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    const nodeTypeKey = e.currentTarget.dataset.nodeType;
                    if (!nodeTypeKey) return;
                    const meta = getMetadata(nodeTypeKey);
                    if (meta) requestCreate(meta);
                  }
                }}
                onMouseEnter={handleTileMouseEnter}
                data-node-type={nodeType}
              >
                <div className="tile-icon" style={{ color: iconColor }}>
                  <IconForType
                    iconName={outputType}
                    showTooltip={false}
                    iconSize="small"
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
