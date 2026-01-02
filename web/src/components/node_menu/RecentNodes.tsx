/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useMetadataStore from "../../stores/MetadataStore";
import { useRecentNodesStore } from "../../stores/RecentNodesStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useCreateNode } from "../../hooks/useCreateNode";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import HistoryIcon from "@mui/icons-material/History";
import ClearIcon from "@mui/icons-material/Clear";

const recentNodesStyles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      padding: "0.5em 0.75em 0.75em 0.5em",
      boxSizing: "border-box",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      marginBottom: "0.5em"
    },
    ".recent-header": {
      marginBottom: "0.5em",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 4px",
      "& .recent-header-title": {
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
      },
      "& .history-icon": {
        fontSize: "1rem",
        opacity: 0.7
      },
      "& .clear-button": {
        padding: "4px",
        minWidth: "unset",
        fontSize: "0.75rem",
        opacity: 0.6,
        cursor: "pointer",
        transition: "opacity 0.2s ease",
        "&:hover": {
          opacity: 1
        }
      }
    },
    ".recent-tiles-container": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
      gridAutoRows: "1fr",
      gap: "8px",
      alignContent: "start",
      padding: "2px",
      maxHeight: "200px",
      overflowY: "auto",
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
    ".recent-tile": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "10px 6px",
      borderRadius: "8px",
      cursor: "pointer",
      position: "relative",
      overflow: "hidden",
      border: "1px solid rgba(255, 255, 255, 0.05)",
      transition: "all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)",
      minHeight: "70px",
      background: "rgba(255, 255, 255, 0.015)",
      "&::before": {
        content: '""',
        position: "absolute",
        inset: 0,
        borderRadius: "inherit",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.04), transparent 80%)",
        opacity: 0,
        transition: "opacity 0.2s ease",
        pointerEvents: "none"
      },
      "&:hover": {
        transform: "translateY(-2px)",
        borderColor: "rgba(255, 255, 255, 0.12)",
        background: "rgba(255, 255, 255, 0.03)",
        boxShadow: "0 4px 12px -4px rgba(0, 0, 0, 0.4)",
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
    ".tile-icon": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: "4px",
      fontSize: "0.75rem",
      fontWeight: 600,
      color: theme.vars.palette.primary.main,
      opacity: 0.9,
      textTransform: "uppercase",
      letterSpacing: "0.5px"
    },
    ".tile-label": {
      fontSize: "0.65rem",
      fontWeight: 500,
      textAlign: "center",
      lineHeight: 1.2,
      color: theme.vars.palette.text.primary,
      opacity: 0.75,
      transition: "opacity 0.2s ease",
      maxWidth: "100%",
      overflow: "hidden",
      textOverflow: "ellipsis",
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical"
    },
    ".empty-message": {
      padding: "1em",
      textAlign: "center",
      color: theme.vars.palette.text.secondary,
      fontSize: "0.8rem",
      opacity: 0.6
    }
  });

const RecentNodes = memo(function RecentNodes() {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => recentNodesStyles(theme), [theme]);

  const { recentNodeTypes, clearRecentNodes } = useRecentNodesStore(
    (state) => ({
      recentNodeTypes: state.recentNodeTypes,
      clearRecentNodes: state.clearRecentNodes
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
    },
    [getMetadata, addNotification, handleCreateNode]
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

  const handleClearRecent = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      clearRecentNodes();
    },
    [clearRecentNodes]
  );

  // Get display name from node type
  const getDisplayName = (nodeType: string): string => {
    const parts = nodeType.split(".");
    return parts[parts.length - 1];
  };

  // Get shortened namespace for icon
  const getShortNamespace = (nodeType: string): string => {
    const parts = nodeType.split(".");
    if (parts.length > 1) {
      return parts[parts.length - 2].substring(0, 3).toUpperCase();
    }
    return parts[0].substring(0, 3).toUpperCase();
  };

  if (recentNodeTypes.length === 0) {
    return null;
  }

  return (
    <Box css={memoizedStyles}>
      <div className="recent-header">
        <Typography variant="h5" className="recent-header-title">
          <HistoryIcon className="history-icon" />
          Recent Nodes
        </Typography>
        <Tooltip title="Clear recent nodes" enterDelay={TOOLTIP_ENTER_DELAY}>
          <ClearIcon className="clear-button" onClick={handleClearRecent} />
        </Tooltip>
      </div>
      <div className="recent-tiles-container">
        {recentNodeTypes.map((nodeType) => {
          const metadata = getMetadata(nodeType);
          if (!metadata) {
            return null;
          }

          return (
            <Tooltip
              key={nodeType}
              title={
                <div>
                  <div>{metadata.title || getDisplayName(nodeType)}</div>
                  <div
                    style={{
                      fontSize: "0.7rem",
                      opacity: 0.75,
                      marginTop: "4px"
                    }}
                  >
                    Click to place · Drag to position
                  </div>
                </div>
              }
              placement="top"
              enterDelay={TOOLTIP_ENTER_DELAY}
            >
              <div
                className="recent-tile"
                draggable
                onDragStart={handleDragStart(nodeType)}
                onDragEnd={handleDragEnd}
                onClick={() => onTileClick(nodeType)}
                onMouseEnter={() => onTileMouseEnter(nodeType)}
              >
                <div className="tile-icon">{getShortNamespace(nodeType)}</div>
                <Typography className="tile-label">
                  {metadata.title || getDisplayName(nodeType)}
                </Typography>
              </div>
            </Tooltip>
          );
        })}
      </div>
    </Box>
  );
});

export default RecentNodes;
