/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useContext, useMemo } from "react";
import type { CSSProperties, MouseEvent, DragEvent as ReactDragEvent } from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import useNodePlacementStore from "../../stores/NodePlacementStore";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useMetadataStore from "../../stores/MetadataStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { NodeContext } from "../../contexts/NodeContext";
import { useNotificationStore } from "../../stores/NotificationStore";
import type { XYPosition, Node as ReactFlowNode } from "@xyflow/react";
import {
  QUICK_ACTION_BUTTONS,
  QuickActionDefinition
} from "../panels/QuickActions";

const tileStyles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      padding: "0.5em 1em 1em 0.5em",
      boxSizing: "border-box"
    },
    ".tiles-header": {
      marginBottom: "1em",
      "& h5": {
        margin: 0,
        fontSize: "0.95rem",
        fontWeight: 500,
        color: theme.vars.palette.text.secondary,
        letterSpacing: "0.3px"
      }
    },
    ".tiles-container": {
      display: "grid",
      gridTemplateColumns: "repeat(2, 1fr)",
      gap: "12px",
      flex: 1
    },
    ".quick-tile": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px 12px",
      borderRadius: "12px",
      cursor: "pointer",
      position: "relative",
      overflow: "hidden",
      border: "1px solid rgba(255, 255, 255, 0.08)",
      transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
      minHeight: "100px",
      "&::before": {
        content: '""',
        position: "absolute",
        inset: 0,
        borderRadius: "inherit",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.12), transparent 60%)",
        opacity: 0.5,
        pointerEvents: "none"
      },
      "&:hover": {
        transform: "translateY(-2px) scale(1.02)",
        borderColor: "rgba(255, 255, 255, 0.2)",
        "& .tile-icon": {
          transform: "scale(1.1)"
        }
      },
      "&:active": {
        transform: "scale(0.98)"
      },
      "&.active": {
        borderColor: theme.vars.palette.primary.main,
        boxShadow: `0 0 0 2px ${theme.vars.palette.primary.main}`
      }
    },
    ".tile-icon": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: "8px",
      transition: "transform 0.25s ease",
      "& svg": {
        fontSize: "2rem",
        filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))"
      }
    },
    ".tile-label": {
      fontSize: "0.75rem",
      fontWeight: 500,
      textAlign: "center",
      lineHeight: 1.3,
      color: "rgba(255, 255, 255, 0.9)",
      textShadow: "0 1px 2px rgba(0,0,0,0.3)"
    }
  });

const QuickActionTiles = memo(function QuickActionTiles() {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => tileStyles(theme), [theme]);
  
  const setDragToCreate = useNodeMenuStore((state) => state.setDragToCreate);
  const closeNodeMenu = useNodeMenuStore((state) => state.closeNodeMenu);
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const nodeStoreFromContext = useContext(NodeContext);
  const { currentWorkflowId, getNodeStore } = useWorkflowManager((state) => ({
    currentWorkflowId: state.currentWorkflowId,
    getNodeStore: state.getNodeStore
  }));
  const nodeStore =
    nodeStoreFromContext ??
    (currentWorkflowId ? getNodeStore(currentWorkflowId) ?? null : null);

  const { activatePlacement, cancelPlacement, pendingNodeType } =
    useNodePlacementStore((state) => ({
      activatePlacement: state.activatePlacement,
      cancelPlacement: state.cancelPlacement,
      pendingNodeType: state.pendingNodeType
    }));

  const getViewportCenter = useCallback((): XYPosition => {
    if (!nodeStore || typeof window === "undefined") {
      return { x: 0, y: 0 };
    }
    const { viewport } = nodeStore.getState();
    const { innerWidth, innerHeight } = window;
    if (!viewport) {
      return { x: 0, y: 0 };
    }
    const { x, y, zoom } = viewport;
    const centerX = innerWidth / 2;
    const centerY = innerHeight / 2;

    return {
      x: (centerX - x) / zoom,
      y: (centerY - y) / zoom
    };
  }, [nodeStore]);

  const computePlacementPosition = useCallback((): XYPosition => {
    const basePosition = getViewportCenter();
    if (!nodeStore) {
      return basePosition;
    }

    const { nodes } = nodeStore.getState();
    if (!nodes || nodes.length === 0) {
      return basePosition;
    }

    const spacingX = 240;
    const spacingY = 180;

    const candidateOffsets: Array<{ offset: XYPosition; distance: number }> =
      [];
    const maxRadius = 3;
    for (let y = -maxRadius; y <= maxRadius; y++) {
      for (let x = -maxRadius; x <= maxRadius; x++) {
        const distance = Math.abs(x) + Math.abs(y);
        candidateOffsets.push({
          offset: { x: x * spacingX, y: y * spacingY },
          distance
        });
      }
    }

    candidateOffsets.sort((a, b) => a.distance - b.distance);

    const isPositionFree = (candidate: XYPosition) => {
      const horizontalBuffer = spacingX * 0.6;
      const verticalBuffer = spacingY * 0.6;

      return nodes.every((node: ReactFlowNode<Record<string, unknown>>) => {
        const pos = node.position ?? { x: 0, y: 0 };
        const nodeWidth = node.width ?? 200;
        const nodeHeight = node.height ?? 140;

        const deltaX = Math.abs(candidate.x - pos.x);
        const deltaY = Math.abs(candidate.y - pos.y);

        const minX = nodeWidth / 2 + horizontalBuffer;
        const minY = nodeHeight / 2 + verticalBuffer;

        return deltaX >= minX || deltaY >= minY;
      });
    };

    for (const { offset } of candidateOffsets) {
      const candidate = {
        x: basePosition.x + offset.x,
        y: basePosition.y + offset.y
      };
      if (isPositionFree(candidate)) {
        return candidate;
      }
    }

    const fallbackOffset = nodes.length + 1;
    return {
      x: basePosition.x + fallbackOffset * (spacingX / 2),
      y: basePosition.y + fallbackOffset * (spacingY / 2)
    };
  }, [getViewportCenter, nodeStore]);

  const handleDragStart = useCallback(
    (nodeType: string) => (event: ReactDragEvent<HTMLDivElement>) => {
      const metadata = getMetadata(nodeType);
      if (!metadata) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      setDragToCreate(true);
      event.dataTransfer.setData("create-node", JSON.stringify(metadata));
      event.dataTransfer.effectAllowed = "copyMove";
    },
    [getMetadata, setDragToCreate]
  );

  const handleDragEnd = useCallback(() => {
    setDragToCreate(false);
  }, [setDragToCreate]);

  const handleAddNode = useCallback(
    (action: QuickActionDefinition, event: MouseEvent<HTMLDivElement>) => {
      const { nodeType, label } = action;
      if (!nodeStore) {
        return;
      }
      const metadata = getMetadata(nodeType);
      if (!metadata) {
        console.warn(`Metadata not found for node type: ${nodeType}`);
        addNotification({
          type: "warning",
          content: `Unable to find metadata for ${label}.`,
          timeout: 4000
        });
        return;
      }

      if (event.shiftKey) {
        const store = nodeStore.getState();
        const position = computePlacementPosition();
        const newNode = store.createNode(metadata, position);
        newNode.selected = true;
        store.addNode(newNode);
        cancelPlacement();
        closeNodeMenu();
        return;
      }

      if (pendingNodeType === nodeType) {
        cancelPlacement();
        return;
      }

      closeNodeMenu();
      activatePlacement(nodeType, label, "quickAction");
      addNotification({
        type: "info",
        content: `Click on the canvas to place "${label}". Press Esc to cancel.`,
        timeout: 5000,
        dismissable: true
      });
    },
    [
      nodeStore,
      getMetadata,
      computePlacementPosition,
      cancelPlacement,
      pendingNodeType,
      activatePlacement,
      addNotification,
      closeNodeMenu
    ]
  );

  if (!nodeStore) {
    return null;
  }

  return (
    <Box css={memoizedStyles}>
      <div className="tiles-header">
        <Typography variant="h5">Quick Actions</Typography>
      </div>
      <div className="tiles-container">
        {QUICK_ACTION_BUTTONS.map((definition) => {
          const {
            key,
            label,
            nodeType,
            icon,
            gradient,
            hoverGradient,
            shadow,
            hoverShadow = shadow,
            iconColor
          } = definition;
          return (
            <Tooltip
              key={key}
              title={
                <div>
                  <div>{label}</div>
                  <div
                    style={{
                      fontSize: "0.7rem",
                      opacity: 0.75,
                      marginTop: "4px"
                    }}
                  >
                    Click to place · Shift-click to auto add
                  </div>
                </div>
              }
              placement="top"
              enterDelay={TOOLTIP_ENTER_DELAY}
            >
              <div
                className={`quick-tile${
                  pendingNodeType === nodeType ? " active" : ""
                }`}
                draggable
                onDragStart={handleDragStart(nodeType)}
                onDragEnd={handleDragEnd}
                onClick={(event) => handleAddNode(definition, event)}
                style={
                  {
                    "--quick-gradient": gradient,
                    "--quick-hover-gradient": hoverGradient,
                    "--quick-shadow": shadow,
                    "--quick-shadow-hover": hoverShadow ?? shadow,
                    "--quick-icon-color": iconColor,
                    background: gradient,
                    boxShadow: shadow
                  } as CSSProperties
                }
                onMouseEnter={(e) => {
                  const target = e.currentTarget;
                  target.style.background = hoverGradient;
                  target.style.boxShadow = hoverShadow ?? shadow;
                }}
                onMouseLeave={(e) => {
                  const target = e.currentTarget;
                  target.style.background = gradient;
                  target.style.boxShadow = shadow;
                }}
              >
                <div className="tile-icon" style={{ color: iconColor }}>
                  {icon}
                </div>
                <Typography className="tile-label">{label}</Typography>
              </div>
            </Tooltip>
          );
        })}
      </div>
    </Box>
  );
});

export default QuickActionTiles;
