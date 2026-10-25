/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import { ConfirmDialog, EmptyState, Tooltip, Text, ToolbarIconButton, thinScrollbarStyles, Box, MOTION, BORDER_RADIUS, FONT_WEIGHT, SPACING, getSpacingPx } from "../ui_primitives";
import CloseIcon from "@mui/icons-material/CloseOutlined";
import ClearIcon from "@mui/icons-material/Clear";
import { NOTIFICATION_TIMEOUT_MEDIUM, NOTIFICATION_TIMEOUT_SHORT } from "../../config/constants";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useMetadataStore from "../../stores/MetadataStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import usePendingNodeCreateStore from "../../stores/PendingNodeCreateStore";
import { useNodeTileDrag } from "../../hooks/nodes/useNodeTileDrag";
import { useFavoriteNodesStore } from "../../stores/FavoriteNodesStore";

const tooltipHintStyle: CSSProperties = {
  fontSize: "var(--fontSizeSmaller)",
  opacity: 0.75,
  marginTop: getSpacingPx(SPACING.xs)
};

const tileStyles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "fit-content",
      padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.xl)} ${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.md)}`,
      boxSizing: "border-box"
    },
    ".tiles-header": {
      marginBottom: getSpacingPx(SPACING.xs),
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: `0 ${getSpacingPx(SPACING.xs)}`
    },
    ".tiles-container": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(116px, 1fr))",
      gridAutoRows: "1fr",
      gap: getSpacingPx(SPACING.sm),
      alignContent: "start",
      overflowY: "auto",
      padding: getSpacingPx(SPACING.micro),
      ...thinScrollbarStyles(theme),
    },
    ".favorite-tile": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.sm)}`,
      borderRadius: BORDER_RADIUS.md,
      cursor: "pointer",
      position: "relative",
      overflow: "hidden",
      border: `1px solid ${theme.vars.palette.divider}`,
      transition: `${MOTION.background}, ${MOTION.border}`,
      minHeight: "30px",
      background: theme.vars.palette.background.paper,
      "&::before": {
        content: '""',
        position: "absolute",
        inset: 0,
        borderRadius: "inherit",
        background: `linear-gradient(180deg, ${theme.vars.palette.action.hover}, transparent 80%)`,
        opacity: 0,
        transition: `opacity ${MOTION.slow}`,
        pointerEvents: "none"
      },
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
      fontWeight: FONT_WEIGHT.semibold,
      textAlign: "center",
      lineHeight: 1.3,
      color: theme.vars.palette.text.primary,
      opacity: 0.8,
      transition: `opacity ${MOTION.slow}`,
      maxWidth: "100%",
      overflow: "hidden",
      textOverflow: "ellipsis",
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical"
    },
    ".clear-button": {
      padding: getSpacingPx(SPACING.xs),
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
      padding: getSpacingPx(SPACING.micro),
      minWidth: 0,
      opacity: 0,
      transition: `opacity ${MOTION.normal}`,
      color: theme.vars.palette.text.secondary,
      "&:hover": {
        color: theme.vars.palette.warning.main,
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    ".favorite-tile:hover .unfavorite-btn": {
      opacity: 1
    },
    // Touch devices have no hover; keep the unfavorite button reachable.
    "@media (pointer: coarse)": {
      ".unfavorite-btn": { opacity: 1 }
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
  const { t } = useTranslation();
  const theme = useTheme();
  const memoizedStyles = useMemo(() => tileStyles(theme), [theme]);

  const { favorites, removeFavorite, clearFavorites } = useFavoriteNodesStore(
    useShallow((state) => ({
      favorites: state.favorites,
      removeFavorite: state.removeFavorite,
      clearFavorites: state.clearFavorites
    }))
  );

  const setHoveredNode = useNodeMenuStore((state) => state.setHoveredNode);

  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  // Route click-to-add via PendingNodeCreateStore so this component is safe
  // to render outside the editor's ReactFlowProvider.
  const requestCreate = usePendingNodeCreateStore((s) => s.requestCreate);

  // Use data attributes to avoid creating new function references on each render
  // This is more efficient than curried handlers which create new closures
  const { handleDragStart, handleDragEnd } = useNodeTileDrag();

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
          content: t("i18n-next50-node-menu.quickActions.metadataMissing", {
            name: nodeType
          }),
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
        content: t("i18n-next50-node-menu.favorites.removedNotification"),
        timeout: NOTIFICATION_TIMEOUT_SHORT
      });
    },
    [removeFavorite, addNotification]
  );

  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

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
              {t("i18n-next50-node-menu.favorites.title")}
            </Text>
          </div>
        )}
        <EmptyState
          size="small"
          title={t("i18n-next50-node-menu.favorites.emptyTitle")}
          description={t("i18n-next50-node-menu.favorites.emptyDescription")}
        />
      </Box>
    );
  }

  return (
    <Box css={memoizedStyles}>
      {!hideHeader && (
        <div className="tiles-header">
          <Text size="normal" weight={600}>
            {t("i18n-next50-node-menu.favorites.title")}
          </Text>
          <ToolbarIconButton
            icon={<ClearIcon fontSize="small" />}
            tooltip={t("i18n-next50-node-menu.favorites.clear")}
            tooltipPlacement="top"
            size="small"
            className="clear-button"
            onClick={() => setClearConfirmOpen(true)}
            aria-label={t("i18n-next50-node-menu.favorites.clear")}
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
                    {t("i18n-next50-node-menu.common.placeHint")}
                  </div>
                </div>
              }
              placement="top"
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
                  tooltip={t("i18n-next50-node-menu.favorites.remove", { name: displayName })}
                  size="small"
                  className="unfavorite-btn"
                  onClick={handleUnfavorite}
                  data-node-type={nodeType}
                  aria-label={t("i18n-next50-node-menu.favorites.remove", { name: displayName })}
                />
                <Text className="tile-label">{displayName}</Text>
              </div>
            </Tooltip>
          );
        })}
      </div>
      <ConfirmDialog
        open={clearConfirmOpen}
        onClose={() => setClearConfirmOpen(false)}
        onConfirm={handleClearFavorites}
        title={t("i18n-next50-node-menu.favorites.clearConfirmTitle")}
        content={t("i18n-next50-node-menu.favorites.clearConfirmContent", { count: favorites.length })}
        confirmText={t("i18n-next50-node-menu.favorites.clear")}
        destructive
        cancelText={t("i18n-next50-node-menu.common.cancel")}
        notificationMessage={t("i18n-next50-node-menu.favorites.clearedNotification")}
        notificationType="success"
      />
    </Box>
  );
});

export default memo(FavoritesTiles);
