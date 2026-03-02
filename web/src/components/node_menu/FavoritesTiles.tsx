/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo } from "react";
import type { CSSProperties, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from "react";
import { Box, Tooltip, Typography, IconButton } from "@mui/material";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import ClearIcon from "@mui/icons-material/Clear";
import { TOOLTIP_ENTER_DELAY, NOTIFICATION_TIMEOUT_MEDIUM, NOTIFICATION_TIMEOUT_SHORT } from "../../config/constants";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useMetadataStore from "../../stores/MetadataStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useCreateNode } from "../../hooks/useCreateNode";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import { useFavoriteNodesStore } from "../../stores/FavoriteNodesStore";

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
    ".favorite-tile": {
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
      minHeight: "30px",
      background: "rgba(255, 255, 255, 0.02)",
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
        borderColor: "rgba(255, 255, 255, 0.15)",
        background: "rgba(255, 255, 255, 0.05)",
        boxShadow: "0 8px 24px -6px rgba(0, 0, 0, 0.5)",
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
      fontSize: "var(--fontSizeNormal)",
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
    },
    ".unfavorite-btn": {
      position: "absolute",
      top: "4px",
      right: "4px",
      padding: "2px",
      minWidth: 0,
      opacity: 0,
      transition: "opacity 0.2s ease",
      color: theme.vars.palette.text.secondary,
      "&:hover": {
        color: theme.vars.palette.warning.main,
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    ".favorite-tile:hover .unfavorite-btn": {
      opacity: 1
    }
  });

const FavoritesTiles = memo(function FavoritesTiles() {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => tileStyles(theme), [theme]);

  const { favorites, removeFavorite, clearFavorites } = useFavoriteNodesStore(
    (state) => ({
      favorites: state.favorites,
      removeFavorite: state.removeFavorite,
      clearFavorites: state.clearFavorites
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
          timeout: NOTIFICATION_TIMEOUT_MEDIUM
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
    (nodeType: string, event: React.MouseEvent) => {
      event.stopPropagation();
      removeFavorite(nodeType);
      addNotification({
        type: "info",
        content: "Node removed from favorites",
        timeout: NOTIFICATION_TIMEOUT_SHORT
      });
    },
    [removeFavorite, addNotification]
  );

  const handleClearFavorites = useCallback(() => {
    clearFavorites();
  }, [clearFavorites]);

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

  const handleTileClick = useCallback(
    (nodeType: string) => () => {
      onTileClick(nodeType);
    },
    [onTileClick]
  );

  const handleTileMouseEnter = useCallback(
    (nodeType: string) => () => {
      onTileMouseEnter(nodeType);
    },
    [onTileMouseEnter]
  );

  const handleUnfavoriteClick = useCallback(
    (nodeType: string) => (e: ReactMouseEvent) => {
      handleUnfavorite(nodeType, e);
    },
    [handleUnfavorite]
  );

  if (favorites.length === 0) {
    return null;
  }

  return (
    <Box css={memoizedStyles}>
      <div className="tiles-header">
        <Typography variant="h5">
          <StarIcon
            fontSize="small"
            sx={{ opacity: 0.8, color: "warning.main" }}
          />
          Favorites
        </Typography>
        <Tooltip
          title="Clear all favorites"
          placement="top"
          enterDelay={TOOLTIP_ENTER_DELAY}
          enterNextDelay={TOOLTIP_ENTER_DELAY}
        >
          <IconButton
            size="small"
            className="clear-button"
            onClick={handleClearFavorites}
            aria-label="Clear all favorites"
          >
            <ClearIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </div>
      <div className="tiles-container">
        {favorites.map((favorite) => {
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
                className="favorite-tile"
                draggable
                onDragStart={handleDragStart(nodeType)}
                onDragEnd={handleDragEnd}
                onClick={handleTileClick(nodeType)}
                onMouseEnter={handleTileMouseEnter(nodeType)}
                style={
                  {
                    background:
                      "linear-gradient(135deg, rgba(255, 193, 7, 0.1), rgba(255, 152, 0, 0.05))"
                  } as CSSProperties
                }
              >
                <IconButton
                  size="small"
                  className="unfavorite-btn"
                  onClick={handleUnfavoriteClick(nodeType)}
                  aria-label={`Remove ${displayName} from favorites`}
                >
                  <StarBorderIcon fontSize="small" />
                </IconButton>
                <Typography className="tile-label">{displayName}</Typography>
              </div>
            </Tooltip>
          );
        })}
      </div>
    </Box>
  );
});

export default memo(FavoritesTiles);
