/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import type { CSSProperties, DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { EmptyState, Tooltip, Text, ToolbarIconButton, thinScrollbarStyles, Box } from "../ui_primitives";
import CloseIcon from "@mui/icons-material/Close";
import ClearIcon from "@mui/icons-material/Clear";
import { TOOLTIP_ENTER_DELAY, NOTIFICATION_TIMEOUT_MEDIUM, NOTIFICATION_TIMEOUT_SHORT } from "../../config/constants";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useMetadataStore from "../../stores/MetadataStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import usePendingNodeCreateStore from "../../stores/PendingNodeCreateStore";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import { useFavoriteNodesStore } from "../../stores/FavoriteNodesStore";

const tooltipHintStyle: CSSProperties = {
  fontSize: "var(--fontSizeSmaller)",
  opacity: 0.75,
  marginTop: "4px"
};

const tileStyles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "fit-content",
      boxSizing: "border-box"
    },
    ".tiles-header": {
      marginBottom: "0.5em",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 4px"
    },
    ".tiles-container": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
      gridAutoRows: "1fr",
      gap: "8px",
      alignContent: "start",
      overflowY: "auto",
      padding: "2px",
      ...thinScrollbarStyles(theme),
    },
    ".favorite-tile": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "12px 8px",
      borderRadius: theme.rounded.md,
      cursor: "pointer",
      position: "relative",
      overflow: "hidden",
      border: `1px solid ${theme.vars.palette.divider}`,
      transition: "background-color 120ms ease, border-color 120ms ease",
      minHeight: "30px",
      background: theme.vars.palette.background.paper,
      "&:hover": {
        borderColor: theme.vars.palette.primary.main,
        background: theme.vars.palette.action.hover
      },
      "&:focus-visible": {
        outline: `2px solid ${theme.vars.palette.primary.main}`,
        outlineOffset: -2
      }
    },
    ".tile-label": {
      fontSize: "var(--fontSizeSmall)",
      fontWeight: 600,
      textAlign: "center",
      lineHeight: 1.3,
      color: theme.vars.palette.text.primary,
      maxWidth: "100%",
      overflow: "hidden",
      textOverflow: "ellipsis",
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical"
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

interface FavoritesTilesProps {
  /**
   * When true, render an empty-state message instead of returning null
   * when there are no favorites. Used by the dedicated Favorites panel
   * in the left sidebar where collapsing to nothing looks broken.
   */
  showEmpty?: boolean;
  /** Hide the internal star+title header (use when the parent already renders one). */
  hideHeader?: boolean;
}

const FavoritesTiles = memo(function FavoritesTiles({
  showEmpty = false,
  hideHeader = false
}: FavoritesTilesProps = {}) {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => tileStyles(theme), [theme]);

  const { favorites, removeFavorite, clearFavorites } = useFavoriteNodesStore(
    useShallow((state) => ({
      favorites: state.favorites,
      removeFavorite: state.removeFavorite,
      clearFavorites: state.clearFavorites
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

  // Route click-to-add via PendingNodeCreateStore so this component is safe
  // to render outside the editor's ReactFlowProvider.
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

  const handleUnfavorite = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const nodeType = event.currentTarget.dataset.nodeType;
      if (!nodeType) {
        return;
      }

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

  if (favorites.length === 0) {
    if (!showEmpty) {
      return null;
    }
    return (
      <Box css={memoizedStyles}>
        {!hideHeader && (
          <div className="tiles-header">
            <Text size="normal" weight={600}>
              Favorites
            </Text>
          </div>
        )}
        <EmptyState
          size="small"
          title="No favorites yet"
          description="Click the star next to any node to add it here."
        />
      </Box>
    );
  }

  return (
    <Box css={memoizedStyles}>
      {!hideHeader && (
        <div className="tiles-header">
          <Text size="normal" weight={600}>
            Favorites
          </Text>
          <ToolbarIconButton
            icon={<ClearIcon fontSize="small" />}
            tooltip="Clear all favorites"
            tooltipPlacement="top"
            size="small"
            className="clear-button"
            onClick={handleClearFavorites}
            aria-label="Clear all favorites"
          />
        </div>
      )}
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
                  <div style={tooltipHintStyle}>
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
                <ToolbarIconButton
                  icon={<CloseIcon fontSize="small" />}
                  tooltip={`Remove ${displayName} from favorites`}
                  size="small"
                  className="unfavorite-btn"
                  onClick={handleUnfavorite}
                  data-node-type={nodeType}
                  aria-label={`Remove ${displayName} from favorites`}
                />
                <Text className="tile-label">{displayName}</Text>
              </div>
            </Tooltip>
          );
        })}
      </div>
    </Box>
  );
});

export default memo(FavoritesTiles);
