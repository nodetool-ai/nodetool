/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import {
  Box,
  Tooltip,
  Typography,
  IconButton,
  Collapse,
  Paper
} from "@mui/material";
import StarIcon from "@mui/icons-material/Star";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useMetadataStore from "../../stores/MetadataStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useCreateNode } from "../../hooks/useCreateNode";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import { useFavoriteNodesStore } from "../../stores/FavoriteNodesStore";

const barStyles = (theme: Theme) =>
  css({
    "&": {
      position: "fixed",
      bottom: "20px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 10000,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "4px"
    },
    ".bar-container": {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "8px 12px",
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: "16px",
      boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0,0,0,0.1)",
      border: `1px solid ${theme.vars.palette.divider}`,
      transition: "all 0.3s ease"
    },
    ".favorites-row": {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      maxWidth: "800px",
      overflow: "hidden"
    },
    ".fav-button": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minWidth: "64px",
      height: "52px",
      padding: "6px 10px",
      borderRadius: "10px",
      cursor: "pointer",
      position: "relative",
      overflow: "hidden",
      border: "1px solid rgba(255, 255, 255, 0.08)",
      transition: "all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)",
      background: "rgba(255, 255, 255, 0.03)",
      "&:hover": {
        transform: "translateY(-2px)",
        borderColor: "rgba(255, 255, 255, 0.2)",
        background: "rgba(255, 255, 255, 0.08)",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.2)"
      },
      "&:active": {
        transform: "scale(0.95)",
        transition: "all 0.1s ease"
      }
    },
    ".fav-button-label": {
      fontSize: "0.65rem",
      fontWeight: 500,
      textAlign: "center",
      lineHeight: 1.2,
      color: theme.vars.palette.text.primary,
      opacity: 0.85,
      maxWidth: "100%",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".toggle-button": {
      padding: "4px",
      minWidth: "32px",
      height: "32px",
      borderRadius: "8px",
      color: theme.vars.palette.text.secondary,
      "&:hover": {
        color: theme.vars.palette.text.primary,
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    ".collapsed-indicator": {
      display: "flex",
      alignItems: "center",
      gap: "4px",
      padding: "4px 12px",
      borderRadius: "20px",
      backgroundColor: theme.vars.palette.background.paper,
      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
      cursor: "pointer",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    ".expand-icon": {
      transition: "transform 0.3s ease",
      "&.expanded": {
        transform: "rotate(180deg)"
      }
    },
    ".empty-state": {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "8px 16px",
      color: theme.vars.palette.text.secondary,
      fontSize: "0.8rem",
      opacity: 0.7
    },
    ".divider": {
      width: "1px",
      height: "36px",
      backgroundColor: theme.vars.palette.divider,
      margin: "0 4px"
    },
    ".settings-tooltip": {
      fontSize: "0.7rem",
      padding: "8px 12px"
    }
  });

interface QuickAccessFavoritesBarProps {
  className?: string;
}

const QuickAccessFavoritesBar: React.FC<QuickAccessFavoritesBarProps> = ({
  className
}) => {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => barStyles(theme), [theme]);

  const [isExpanded, setIsExpanded] = useState(true);

  const { favorites } = useFavoriteNodesStore((state) => ({
    favorites: state.favorites
  }));

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

      addNotification({
        type: "success",
        content: `Added ${metadata.title || nodeType.split(".").pop()} to canvas`,
        timeout: 2000
      });
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

  const onTileMouseLeave = useCallback(() => {
    setHoveredNode(null);
  }, [setHoveredNode]);

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

  const handleToggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  if (favorites.length === 0) {
    return null;
  }

  const displayFavorites = isExpanded ? favorites : favorites.slice(0, 5);

  return (
    <Box css={memoizedStyles} className={className}>
      <Collapse in={isExpanded} orientation="vertical">
        <Paper className="bar-container" elevation={0}>
          <Tooltip
            title={
              <div className="settings-tooltip">
                Click to add node · Drag to canvas
              </div>
            }
            placement="top"
            enterDelay={300}
          >
            <Box className="favorites-row">
              <Tooltip title="Favorites" placement="top" enterDelay={300}>
                <IconButton size="small" disabled>
                  <StarIcon
                    fontSize="small"
                    sx={{ color: "warning.main", opacity: 0.8 }}
                  />
                </IconButton>
              </Tooltip>

              <div className="divider" />

              {displayFavorites.map((favorite) => {
                const { nodeType } = favorite;
                const displayName = getNodeDisplayName(nodeType);

                return (
                  <Tooltip
                    key={nodeType}
                    title={
                      <div>
                        <div style={{ fontWeight: 500 }}>{displayName}</div>
                        <div
                          style={{
                            fontSize: "0.65rem",
                            opacity: 0.75,
                            marginTop: "2px"
                          }}
                        >
                          Click to add · Drag to position
                        </div>
                      </div>
                    }
                    placement="top"
                    enterDelay={300}
                  >
                    <div
                      className="fav-button"
                      draggable
                      onDragStart={handleDragStart(nodeType)}
                      onDragEnd={handleDragEnd}
                      onClick={() => onTileClick(nodeType)}
                      onMouseEnter={() => onTileMouseEnter(nodeType)}
                      onMouseLeave={onTileMouseLeave}
                      style={{
                        background:
                          "linear-gradient(135deg, rgba(255, 193, 7, 0.12), rgba(255, 152, 0, 0.06))"
                      }}
                    >
                      <Typography className="fav-button-label">
                        {displayName}
                      </Typography>
                    </div>
                  </Tooltip>
                );
              })}

              {favorites.length > 5 && !isExpanded && (
                <Tooltip
                  title={`${favorites.length - 5} more favorites`}
                  placement="top"
                  enterDelay={300}
                >
                  <Box
                    className="fav-button"
                    onClick={handleToggleExpand}
                    sx={{ minWidth: "40px" }}
                  >
                    <Typography className="fav-button-label">
                      +{favorites.length - 5}
                    </Typography>
                  </Box>
                </Tooltip>
              )}
            </Box>
          </Tooltip>

          <div className="divider" />

          <Tooltip
            title={isExpanded ? "Collapse favorites" : "Expand favorites"}
            placement="top"
            enterDelay={300}
          >
            <IconButton
              size="small"
              className="toggle-button"
              onClick={handleToggleExpand}
              aria-label={isExpanded ? "Collapse favorites" : "Expand favorites"}
            >
              <ExpandMoreIcon
                fontSize="small"
                className={isExpanded ? "expanded" : ""}
                sx={{
                  transition: "transform 0.3s ease",
                  transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)"
                }}
              />
            </IconButton>
          </Tooltip>
        </Paper>
      </Collapse>

      {!isExpanded && favorites.length > 0 && (
        <Tooltip title="Expand favorites" placement="top" enterDelay={300}>
          <Box
            className="collapsed-indicator"
            onClick={handleToggleExpand}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                handleToggleExpand();
              }
            }}
            aria-label="Expand favorites bar"
          >
            <StarIcon
              fontSize="small"
              sx={{ color: "warning.main", opacity: 0.8 }}
            />
            <Typography variant="caption" sx={{ fontWeight: 500 }}>
              {favorites.length} favorite{favorites.length !== 1 ? "s" : ""}
            </Typography>
            <ExpandLessIcon
              fontSize="small"
              sx={{ opacity: 0.6 }}
            />
          </Box>
        </Tooltip>
      )}
    </Box>
  );
};

export default memo(QuickAccessFavoritesBar);
