/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo } from "react";
import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent
} from "react";
import { Tooltip, Text, thinScrollbarStyles } from "../ui_primitives";
import { TOOLTIP_ENTER_DELAY, NOTIFICATION_TIMEOUT_MEDIUM } from "../../config/constants";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { useShallow } from "zustand/react/shallow";
import useMetadataStore from "../../stores/MetadataStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import usePendingNodeCreateStore from "../../stores/PendingNodeCreateStore";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import {
  QUICK_ACTION_BUTTONS,
  CONSTANT_NODES,
  type QuickActionDefinition
} from "./QuickActionTiles.constants";

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
      marginBottom: "0.5em",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 4px",
      "& h5": {
        margin: 0,
        fontSize: "15px",
        fontWeight: 600,
        color: theme.vars.palette.text.secondary,
        textTransform: "uppercase",
        letterSpacing: "1px",
        opacity: 0.8
      }
    },
    ".tiles-container": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
      gridAutoRows: "1fr",
      gap: "8px",
      alignContent: "start",
      overflow: "visible",
      padding: "2px"
    },
    ".constants-container": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))",
      gridAutoRows: "1fr",
      gap: "8px",
      alignContent: "start",
      marginTop: "12px",
      padding: "2px",
      ...thinScrollbarStyles(theme)
    },
    ".quick-tile": {
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
      minHeight: "30px",
      background: theme.vars.palette.background.paper,
      "&::before": {
        content: '""',
        position: "absolute",
        inset: 0,
        borderRadius: "inherit",
        // Soft gradient overlay
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.06), transparent 80%)",
        opacity: 0,
        transition: "opacity 0.3s ease",
        pointerEvents: "none"
      },
      "&:hover": {
        transform: "translateY(-3px)",
        borderColor: theme.vars.palette.primary.main,
        background: "var(--quick-hover-tile-bg)",
        boxShadow: "none",
        "&::before": {
          opacity: 1
        },
        "& .tile-icon": {
          transform: "scale(1.15) rotate(5deg)"
        },
        "& .tile-label": {
          opacity: 1
        }
      },
      "&:active": {
        transform: "scale(0.97) translateY(0)",
        transition: "all 0.1s ease"
      },
      "&.active": {
        borderColor: theme.vars.palette.primary.main,
        boxShadow: `0 0 0 2px ${theme.vars.palette.primary.main}`
      }
    },
    ".constant-tile": {
      minHeight: "70px",
      padding: "10px 6px",
      "& .tile-icon": {
        marginBottom: "4px",
        "& svg": {
          fontSize: "18px"
        }
      },
      "& .tile-label": {
        fontSize: "var(--fontSizeNormal)"
      }
    },
    ".tile-icon": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: "6px",
      transition: "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
      "& svg": {
        fontSize: "18px",
        filter: theme.palette.mode === "dark"
          ? "drop-shadow(0 3px 5px rgba(0,0,0,0.35))"
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
      transition: "opacity 0.3s ease",
      maxWidth: "100%"
    }
  });

const QuickActionTiles = memo(function QuickActionTiles() {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => tileStyles(theme), [theme]);

  const { setDragToCreate, setHoveredNode } = useNodeMenuStore(useShallow((state) => ({
    setDragToCreate: state.setDragToCreate,
    setHoveredNode: state.setHoveredNode
  })));
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);

  // Route click-to-add via PendingNodeCreateStore so this component is safe
  // to render outside the editor's ReactFlowProvider.
  const requestCreate = usePendingNodeCreateStore((s) => s.requestCreate);

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
      // Use unified drag serialization
      serializeDragData(
        { type: "create-node", payload: metadata },
        event.dataTransfer
      );
      event.dataTransfer.effectAllowed = "copyMove";

      // Update global drag state
      setActiveDrag({ type: "create-node", payload: metadata });
    },
    [getMetadata, setDragToCreate, setActiveDrag]
  );

  const handleDragEnd = useCallback(() => {
    setDragToCreate(false);
    clearDrag();
  }, [setDragToCreate, clearDrag]);

  const onTileClick = useCallback(
    (action: QuickActionDefinition) => {
      const { nodeType, label } = action;
      const metadata = getMetadata(nodeType);

      if (!metadata) {
        console.warn(`Metadata not found for node type: ${nodeType}`);
        addNotification({
          type: "warning",
          content: `Unable to find metadata for ${label}.`,
          timeout: NOTIFICATION_TIMEOUT_MEDIUM
        });
        return;
      }

      requestCreate(metadata);
    },
    [getMetadata, addNotification, requestCreate]
  );

  const onTileMouseEnter = useCallback(
    (nodeType: string) => {
      const metadata = getMetadata(nodeType);
      if (metadata) {
        setHoveredNode(metadata);
      }
    },
    [getMetadata, setHoveredNode]
  );

  // Use data attributes to avoid creating new function references on each render
  // This is more efficient than curried handlers which create new closures
  const handleTileClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const nodeType = event.currentTarget.dataset.nodeType;
      if (nodeType) {
        const metadata = getMetadata(nodeType);
        if (metadata) {
          const definition = [...QUICK_ACTION_BUTTONS, ...CONSTANT_NODES].find(
            (d) => d.nodeType === nodeType
          );
          if (definition) {
            onTileClick(definition);
          }
        }
      }
    },
    [getMetadata, onTileClick]
  );

  const handleTileMouseEnter = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const nodeType = event.currentTarget.dataset.nodeType;
      if (nodeType) {
        onTileMouseEnter(nodeType);
      }
    },
    [onTileMouseEnter]
  );

  // Memoize tooltip subtitle style to avoid recreating on every render
  const tooltipSubtitleStyle = useMemo(
    () => ({
      fontSize: "11px" as const,
      opacity: 0.75,
      marginTop: "4px"
    }),
    []
  );

  // Memoize constants header style
  const constantsHeaderStyle = useMemo(
    () => ({
      marginTop: "16px",
      marginBottom: "8px"
    }),
    []
  );

  return (
    <div css={memoizedStyles}>
      <div className="tiles-header">
        <Text size="normal" weight={600}>AI Nodes</Text>
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
                  <div style={tooltipSubtitleStyle}>
                    Click to place · Shift-click to auto add
                  </div>
                </div>
              }
              placement="top"
              delay={TOOLTIP_ENTER_DELAY}
              nextDelay={TOOLTIP_ENTER_DELAY}
            >
              <div
                className="quick-tile"
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
                style={
                  {
                    "--quick-gradient": gradient,
                    "--quick-hover-tile-bg": hoverGradient,
                    "--quick-shadow": shadow,
                    "--quick-shadow-hover": hoverShadow ?? shadow,
                    "--quick-icon-color": iconColor
                  } as CSSProperties
                }
              >
                <div className="tile-icon" style={{ color: iconColor }}>
                  {icon}
                </div>
                <Text className="tile-label">{label}</Text>
              </div>
            </Tooltip>
          );
        })}
      </div>
      <div className="tiles-header" style={constantsHeaderStyle}>
        <Text size="normal" weight={600}>Constants</Text>
      </div>
      <div className="constants-container">
        {CONSTANT_NODES.map((definition) => {
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
                  <div>{label} Constant</div>
                  <div style={tooltipSubtitleStyle}>
                    Click to place
                  </div>
                </div>
              }
              placement="top"
              delay={TOOLTIP_ENTER_DELAY}
              nextDelay={TOOLTIP_ENTER_DELAY}
            >
              <div
                className="quick-tile constant-tile"
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
                style={
                  {
                    "--quick-gradient": gradient,
                    "--quick-hover-tile-bg": hoverGradient,
                    "--quick-shadow": shadow,
                    "--quick-shadow-hover": hoverShadow ?? shadow,
                    "--quick-icon-color": iconColor
                  } as CSSProperties
                }
              >
                <div className="tile-icon" style={{ color: iconColor }}>
                  {icon}
                </div>
                <Text className="tile-label">{label}</Text>
              </div>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
});

export default memo(QuickActionTiles);
