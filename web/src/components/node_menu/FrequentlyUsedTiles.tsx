/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo } from "react";
import type { CSSProperties, DragEvent as ReactDragEvent } from "react";
import { Box, Tooltip, Typography, IconButton } from "@mui/material";
import WhatshotIcon from "@mui/icons-material/Whatshot";
import ClearIcon from "@mui/icons-material/Clear";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useMetadataStore from "../../stores/MetadataStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useCreateNode } from "../../hooks/useCreateNode";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import {
  useFrequentlyUsedNodesStore,
  FrequentlyUsedNode
} from "../../stores/FrequentlyUsedNodesStore";
import { QUICK_ACTION_BUTTONS } from "./QuickActionTiles";

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
      padding: "2px",
      "&::-webkit-scrollbar": {
        width: "6px"
      },
      "&::-webkit-scrollbar-track": {
        background: "transparent"
      },
      "&::-webkit-scrollbar-thumb": {
        backgroundColor: theme.vars.palette.action.disabledBackground,
        borderRadius: "8px"
      },
      "&::-webkit-scrollbar-thumb:hover": {
        backgroundColor: theme.vars.palette.action.disabled
      }
    },
    ".frequent-tile": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "12px 8px",
      borderRadius: "12px",
      cursor: "pointer",
      position: "relative",
      overflow: "hidden",
      border: "1px solid rgba(255, 255, 255, 0.06)",
      transition: "all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)",
      minHeight: "80px",
      background: "rgba(255, 255, 255, 0.02)",
      "&::before": {
        content: '""',
        position: "absolute",
        inset: 0,
        borderRadius: "inherit",
        background:
          "linear-gradient(180deg, rgba(255,100,50,0.08), transparent 80%)",
        opacity: 0,
        transition: "opacity 0.3s ease",
        pointerEvents: "none"
      },
      "&:hover": {
        transform: "translateY(-3px)",
        borderColor: "rgba(255, 150, 100, 0.25)",
        background: "rgba(255, 100, 50, 0.05)",
        boxShadow: "0 8px 24px -6px rgba(255, 100, 50, 0.2)",
        "&::before": {
          opacity: 1
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
    ".tile-label": {
      fontSize: "0.7rem",
      fontWeight: 500,
      textAlign: "center",
      lineHeight: 1.3,
      color: theme.vars.palette.text.primary,
      opacity: 0.8,
      transition: "opacity 0.3s ease",
      maxWidth: "100%",
      overflow: "hidden",
      textOverflow: "ellipsis",
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical"
    },
    ".count-badge": {
      position: "absolute",
      top: "4px",
      left: "4px",
      fontSize: "0.6rem",
      fontWeight: 600,
      padding: "2px 6px",
      borderRadius: "10px",
      backgroundColor: "rgba(255, 100, 50, 0.15)",
      color: theme.vars.palette.warning.light,
      fontFamily: "monospace"
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

interface FrequentlyUsedTilesProps {
  onNodeAdded?: (nodeType: string) => void;
}

const FrequentlyUsedTiles = memo(function FrequentlyUsedTiles({
  onNodeAdded
}: FrequentlyUsedTilesProps) {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => tileStyles(theme), [theme]);

  const { frequentlyUsed, clearUsageData } = useFrequentlyUsedNodesStore(
    (state) => ({
      frequentlyUsed: state.getFrequentlyUsed(),
      clearUsageData: state.clearUsageData
    })
  );

  const { setDragToCreate, setHoveredNode } = useNodeMenuStore((state) => ({
    setDragToCreate: state.setDragToCreate,
    setHoveredNode: state.setHoveredNode
  }));

  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);

  const handleCreateNode = useCreateNode();

  const handleDragStart = useCallback(
    (nodeType: string) => (event: ReactDragEvent<HTMLDivElement>) => {
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

  const onTileClick = useCallback(
    (nodeType: string) => {
      const metadata = getMetadata(nodeType);

      if (!metadata) {
        console.warn(`Metadata not found for node type: ${nodeType}`);
        addNotification({
          type: "warning",
          content: `Unable to find metadata for ${nodeType}.`,
          timeout: 4000
        });
        return;
      }

      handleCreateNode(metadata);
      onNodeAdded?.(nodeType);
    },
    [getMetadata, addNotification, handleCreateNode, onNodeAdded]
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

  const handleClearFrequent = useCallback(() => {
    clearUsageData();
    addNotification({
      type: "info",
      content: "Usage data cleared",
      timeout: 2000
    });
  }, [clearUsageData, addNotification]);

  const getNodeDisplayName = useCallback(
    (nodeType: string) => {
      const metadata = getMetadata(nodeType);
      if (metadata) {
        return (
          metadata.title || metadata.node_type.split(".").pop() || nodeType
        );
      }
      return nodeType.split(".").pop() || nodeType;
    },
    [getMetadata]
  );

  const filteredFrequentNodes = useMemo(
    () =>
      frequentlyUsed.filter(
        (node) => !QUICK_ACTION_NODE_TYPES.has(node.nodeType)
      ),
    [frequentlyUsed]
  );

  if (filteredFrequentNodes.length === 0) {
    return null;
  }

  return (
    <Box css={memoizedStyles}>
      <div className="tiles-header">
        <Typography variant="h5">
          <WhatshotIcon
            fontSize="small"
            sx={{ opacity: 0.8, color: "warning.light" }}
          />
          Frequently Used
        </Typography>
        <Tooltip title="Clear usage data" placement="top">
          <IconButton
            size="small"
            className="clear-button"
            onClick={handleClearFrequent}
            aria-label="Clear usage data"
          >
            <ClearIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </div>
      <div className="tiles-container">
        {filteredFrequentNodes.map((frequentNode: FrequentlyUsedNode) => {
          const { nodeType, count } = frequentNode;
          const displayName = getNodeDisplayName(nodeType);

          return (
            <Tooltip
              key={nodeType}
              title={
                <div>
                  <div>{displayName}</div>
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
              enterDelay={TOOLTIP_ENTER_DELAY}
              enterNextDelay={TOOLTIP_ENTER_DELAY}
            >
              <div
                className="frequent-tile"
                draggable
                onDragStart={handleDragStart(nodeType)}
                onDragEnd={handleDragEnd}
                onClick={() => onTileClick(nodeType)}
                onMouseEnter={() => onTileMouseEnter(nodeType)}
                style={
                  {
                    background: theme.vars.palette.action.selected
                  } as CSSProperties
                }
              >
                <span className="count-badge">{count}</span>
                <Typography className="tile-label">{displayName}</Typography>
              </div>
            </Tooltip>
          );
        })}
      </div>
    </Box>
  );
});

export default FrequentlyUsedTiles;
