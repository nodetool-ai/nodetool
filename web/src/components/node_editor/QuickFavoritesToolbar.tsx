/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo } from "react";
import type { DragEvent as ReactDragEvent, MouseEvent } from "react";
import { Box, Tooltip, IconButton, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import StarIcon from "@mui/icons-material/Star";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useMetadataStore from "../../stores/MetadataStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useCreateNode } from "../../hooks/useCreateNode";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import { useFavoriteNodesStore } from "../../stores/FavoriteNodesStore";

const MAX_TOOLBAR_FAVORITES = 6;

const toolbarStyles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      gap: "8px",
      padding: "8px 12px",
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: "12px",
      border: `1px solid ${theme.vars.palette.divider}`,
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
      minHeight: "48px"
    },
    ".toolbar-label": {
      fontSize: "0.75rem",
      fontWeight: 600,
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      marginRight: "4px",
      display: "flex",
      alignItems: "center",
      gap: "4px",
      "& svg": {
        fontSize: "1rem",
        color: "warning.main"
      }
    },
    ".favorites-container": {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      gap: "4px",
      flex: 1
    },
    ".favorite-button": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      width: "40px",
      height: "40px",
      borderRadius: "8px",
      cursor: "pointer",
      position: "relative",
      overflow: "hidden",
      border: "1px solid rgba(255, 255, 255, 0.08)",
      transition: "all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)",
      background: "rgba(255, 193, 7, 0.08)",
      "&:hover": {
        transform: "translateY(-2px)",
        borderColor: "rgba(255, 193, 7, 0.3)",
        background: "rgba(255, 193, 7, 0.15)",
        boxShadow: "0 4px 12px rgba(255, 193, 7, 0.2)"
      },
      "&:active": {
        transform: "scale(0.95)",
        transition: "all 0.1s ease"
      }
    },
    ".favorite-button svg": {
      fontSize: "1.1rem",
      color: "warning.main"
    },
    ".add-button": {
      width: "36px",
      height: "36px",
      borderRadius: "8px",
      backgroundColor: theme.vars.palette.action.hover,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.selected
      }
    },
    ".empty-state": {
      fontSize: "0.75rem",
      color: theme.vars.palette.text.secondary,
      opacity: 0.6,
      fontStyle: "italic",
      padding: "0 8px"
    },
    ".divider": {
      width: "1px",
      height: "28px",
      backgroundColor: theme.vars.palette.divider,
      margin: "0 4px"
    }
  });

const QuickFavoritesToolbar = memo(function QuickFavoritesToolbar() {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => toolbarStyles(theme), [theme]);

  const { favorites, removeFavorite } = useFavoriteNodesStore((state) => ({
    favorites: state.favorites,
    removeFavorite: state.removeFavorite
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
  const openNodeMenu = useNodeMenuStore((state) => state.openNodeMenu);

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

  const handleUnfavorite = useCallback(
    (nodeType: string, event: MouseEvent) => {
      event.stopPropagation();
      removeFavorite(nodeType);
      addNotification({
        type: "info",
        content: "Removed from quick favorites",
        timeout: 2000
      });
    },
    [removeFavorite, addNotification]
  );

  const handleOpenNodeMenu = useCallback(() => {
    const mousePos = { x: window.innerWidth / 2 - 400, y: window.innerHeight / 2 - 300 };
    openNodeMenu({
      x: mousePos.x,
      y: mousePos.y,
      centerOnScreen: true
    });
  }, [openNodeMenu]);

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

  const displayedFavorites = useMemo(
    () => favorites.slice(0, MAX_TOOLBAR_FAVORITES),
    [favorites]
  );

  if (favorites.length === 0) {
    return null;
  }

  return (
    <Box
      css={memoizedStyles}
      role="region"
      aria-label="Quick Favorites Toolbar"
      component="section"
    >
      <Typography className="toolbar-label" variant="caption">
        <StarIcon fontSize="small" />
        Quick
      </Typography>
      <div className="divider" />
      <div className="favorites-container">
        {displayedFavorites.map((favorite) => {
          const { nodeType } = favorite;
          const displayName = getNodeDisplayName(nodeType);

          return (
            <Tooltip
              key={nodeType}
              title={
                <div>
                  <div>{displayName}</div>
                  <div
                    style={{
                      fontSize: "0.65rem",
                      opacity: 0.75,
                      marginTop: "2px"
                    }}
                  >
                    Click to add
                  </div>
                </div>
              }
              placement="bottom"
              enterDelay={TOOLTIP_ENTER_DELAY}
            >
              <div
                className="favorite-button"
                draggable
                onDragStart={handleDragStart(nodeType)}
                onDragEnd={handleDragEnd}
                onClick={() => onTileClick(nodeType)}
                onMouseEnter={() => onTileMouseEnter(nodeType)}
                onContextMenu={(e) => handleUnfavorite(nodeType, e)}
                role="button"
                tabIndex={0}
                aria-label={`Add ${displayName} to canvas`}
              >
                <StarIcon fontSize="small" />
              </div>
            </Tooltip>
          );
        })}
        {favorites.length > MAX_TOOLBAR_FAVORITES && (
          <Tooltip
            title={`${favorites.length - MAX_TOOLBAR_FAVORITES} more favorites`}
            placement="bottom"
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "40px",
                height: "40px",
                borderRadius: "8px",
                fontSize: "0.7rem",
                fontWeight: 600,
                color: "text.secondary",
                backgroundColor: "action.hover"
              }}
            >
              +{favorites.length - MAX_TOOLBAR_FAVORITES}
            </Box>
          </Tooltip>
        )}
      </div>
      <div className="divider" />
      <Tooltip title="Open node menu" placement="bottom">
        <IconButton
          className="add-button"
          size="small"
          onClick={handleOpenNodeMenu}
          aria-label="Open node menu"
        >
          <AddIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
});

export default QuickFavoritesToolbar;
