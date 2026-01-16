/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo } from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import StarIcon from "@mui/icons-material/Star";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useMetadataStore from "../../stores/MetadataStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useCreateNode } from "../../hooks/useCreateNode";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";
import { useFavoriteNodesStore } from "../../stores/FavoriteNodesStore";
import { colorForType } from "../../config/data_types";
import { iconMap } from "../../config/data_types";

const QUICK_FAVORITES_MAX_ITEMS = 6;

const quickFavoritesStyles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "8px 12px",
      backgroundColor: theme.vars.palette.action.hover,
      borderRadius: "8px",
      marginBottom: "8px",
      overflowX: "auto",
      scrollbarWidth: "thin",
      scrollbarColor: `${theme.vars.palette.action.disabledBackground} transparent`,
      "&::-webkit-scrollbar": {
        height: "4px"
      },
      "&::-webkit-scrollbar-track": {
        background: "transparent"
      },
      "&::-webkit-scrollbar-thumb": {
        backgroundColor: theme.vars.palette.action.disabledBackground,
        borderRadius: "4px"
      }
    },
    ".quick-favorites-label": {
      display: "flex",
      alignItems: "center",
      gap: "4px",
      fontSize: "0.7rem",
      fontWeight: 600,
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      whiteSpace: "nowrap",
      flexShrink: 0,
      "& .star-icon": {
        fontSize: "0.9rem",
        color: "warning.main"
      }
    },
    ".quick-favorites-items": {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      flexGrow: 1
    },
    ".quick-favorite-item": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "36px",
      height: "36px",
      borderRadius: "6px",
      cursor: "grab",
      position: "relative",
      flexShrink: 0,
      transition: "all 0.2s ease",
      border: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.background.paper,
      "&:hover": {
        transform: "scale(1.1)",
        boxShadow: `0 2px 8px ${theme.vars.palette.primary.main}40`,
        borderColor: theme.vars.palette.primary.main
      },
      "&:active": {
        cursor: "grabbing",
        transform: "scale(0.95)"
      }
    },
    ".quick-favorite-item.selected": {
      borderColor: theme.vars.palette.primary.main,
      boxShadow: `0 0 0 2px ${theme.vars.palette.primary.main}40`
    },
    ".quick-favorite-icon": {
      fontSize: "1.1rem",
      color: theme.vars.palette.text.primary
    },
    ".quick-favorite-letter": {
      fontSize: "0.85rem",
      fontWeight: 700,
      color: theme.vars.palette.text.primary,
      textTransform: "uppercase"
    },
    ".quick-favorite-tooltip": {
      fontSize: "0.75rem"
    },
    ".empty-state": {
      fontSize: "0.7rem",
      color: theme.vars.palette.text.secondary,
      fontStyle: "italic",
      padding: "0 8px"
    }
  });

const getNodeIcon = (nodeType: string): React.FC<React.SVGProps<SVGSVGElement>> | null => {
  const parts = nodeType.split(".");
  const lastPart = parts[parts.length - 1].toLowerCase();
  const iconKey = lastPart.replace(/([A-Z])/g, "_$1").toLowerCase();
  if (iconMap[iconKey]) {
    return iconMap[iconKey];
  }
  const namespace = parts[1]?.toLowerCase();
  if (namespace && iconMap[namespace]) {
    return iconMap[namespace];
  }
  return null;
};

interface NodeMetadataShape {
  outputs?: Array<{ type: { type: string } }>;
}

const getNodeColor = (nodeType: string, metadata: Record<string, NodeMetadataShape>): string => {
  const meta = metadata[nodeType];
  if (meta?.outputs?.[0]?.type?.type) {
    return colorForType(meta.outputs[0].type.type);
  }
  return "#666";
};

interface QuickFavoritesBarProps {
  onItemSelected?: (nodeType: string) => void;
}

const QuickFavoritesBar: React.FC<QuickFavoritesBarProps> = ({
  onItemSelected
}) => {
  const theme = useTheme();
  const memoizedStyles = useMemo(() => quickFavoritesStyles(theme), [theme]);

  const favorites = useFavoriteNodesStore((state) => state.favorites);
  const removeFavorite = useFavoriteNodesStore((state) => state.removeFavorite);
  const quickFavorites = useMemo(
    () => favorites.slice(0, QUICK_FAVORITES_MAX_ITEMS),
    [favorites]
  );

  const { setDragToCreate, setHoveredNode } = useNodeMenuStore((state) => ({
    setDragToCreate: state.setDragToCreate,
    setHoveredNode: state.setHoveredNode
  }));

  const metadata = useMetadataStore((state) => state.metadata);
  const addNotification = useNotificationStore((state) => state.addNotification);
  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);

  const handleCreateNode = useCreateNode();

  const handleDragStart = useCallback(
    (nodeType: string) => (event: React.DragEvent<HTMLDivElement>) => {
      const meta = metadata[nodeType];
      if (!meta) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      setDragToCreate(true);
      serializeDragData(
        { type: "create-node", payload: meta },
        event.dataTransfer
      );
      event.dataTransfer.effectAllowed = "copyMove";
      setActiveDrag({ type: "create-node", payload: meta });
    },
    [metadata, setDragToCreate, setActiveDrag]
  );

  const handleDragEnd = useCallback(() => {
    setDragToCreate(false);
    clearDrag();
  }, [setDragToCreate, clearDrag]);

  const onTileClick = useCallback(
    (nodeType: string) => {
      const meta = metadata[nodeType];

      if (!meta) {
        addNotification({
          type: "warning",
          content: `Unable to find metadata for ${nodeType}.`,
          timeout: 4000
        });
        return;
      }

      handleCreateNode(meta);
      onItemSelected?.(nodeType);
    },
    [metadata, addNotification, handleCreateNode, onItemSelected]
  );

  const onTileMouseEnter = useCallback(
    (nodeType: string) => {
      const meta = metadata[nodeType];
      if (meta) {
        setHoveredNode(meta);
      }
    },
    [metadata, setHoveredNode]
  );

  const onTileMouseLeave = useCallback(() => {
    setHoveredNode(null);
  }, [setHoveredNode]);

  const getNodeDisplayName = useCallback(
    (nodeType: string) => {
      const meta = metadata[nodeType];
      if (meta) {
        return (
          meta.title || meta.node_type.split(".").pop() || nodeType
        );
      }
      return nodeType.split(".").pop() || nodeType;
    },
    [metadata]
  );

  const getNodeInitial = useCallback((nodeType: string) => {
    const name = getNodeDisplayName(nodeType);
    return name.charAt(0).toUpperCase();
  }, [getNodeDisplayName]);

  const handleContextMenu = useCallback(
    (nodeType: string, event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      removeFavorite(nodeType);
      addNotification({
        type: "info",
        content: "Node removed from favorites",
        timeout: 2000
      });
    },
    [removeFavorite, addNotification]
  );

  if (quickFavorites.length === 0) {
    return null;
  }

  return (
    <Box css={memoizedStyles}>
      <div className="quick-favorites-label">
        <StarIcon className="star-icon" fontSize="small" />
        <span>Quick</span>
      </div>
      <div className="quick-favorites-items">
        {quickFavorites.map((favorite) => {
          const { nodeType } = favorite;
          const displayName = getNodeDisplayName(nodeType);
          const IconComponent = getNodeIcon(nodeType);
          const nodeColor = getNodeColor(nodeType, metadata);

          return (
            <Tooltip
              key={nodeType}
              title={
                <div className="quick-favorite-tooltip">
                  <div>{displayName}</div>
                  <div
                    style={{
                      fontSize: "0.65rem",
                      opacity: 0.75,
                      marginTop: "2px"
                    }}
                  >
                    Click to place · Right-click to remove
                  </div>
                </div>
              }
              placement="top"
              enterDelay={TOOLTIP_ENTER_DELAY}
            >
              <div
                className="quick-favorite-item"
                draggable
                onDragStart={handleDragStart(nodeType)}
                onDragEnd={handleDragEnd}
                onClick={() => onTileClick(nodeType)}
                onMouseEnter={() => onTileMouseEnter(nodeType)}
                onMouseLeave={onTileMouseLeave}
                onContextMenu={(e) => handleContextMenu(nodeType, e)}
                style={{ borderLeft: `3px solid ${nodeColor}` } as React.CSSProperties}
              >
                {IconComponent ? (
                  <IconComponent className="quick-favorite-icon" />
                ) : (
                  <Typography className="quick-favorite-letter">
                    {getNodeInitial(nodeType)}
                  </Typography>
                )}
              </div>
            </Tooltip>
          );
        })}
      </div>
    </Box>
  );
};

export default memo(QuickFavoritesBar);
