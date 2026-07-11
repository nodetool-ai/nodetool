/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, memo, useMemo, useRef, useEffect } from "react";
import { EditorButton, Text, Tooltip, Box, MOTION, BORDER_RADIUS } from "../ui_primitives";
import FolderIcon from "@mui/icons-material/Folder";
import NavigateIcon from "@mui/icons-material/NavigateNext";
import { AssetWithPath } from "../../stores/ApiTypes";
import { useAssetSelection } from "../../hooks/assets/useAssetSelection";
import useContextMenuStore from "../../stores/ContextMenuStore";
import { formatFileSize } from "../../utils/formatUtils";
import { secondsToHMS } from "../../utils/formatDateAndTime";
import { IconForType } from "../../config/IconForType";
import { getAssetCategory } from "./assetGridUtils";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useAssetSearch } from "../../serverState/useAssetSearch";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  serializeDragData,
  createAssetDragImage
} from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";

interface GlobalSearchResultsProps {
  results: AssetWithPath[];
  onAssetDoubleClick?: (asset: AssetWithPath) => void;
  onNavigateToFolder?: (folderId: string, folderPath: string) => void;
  containerWidth?: number;
}

const styles = (theme: Theme) =>
  css({
    "&": {
      width: "100%",
      height: "100%"
    },
    ".search-results-container": {
      display: "flex",
      flexDirection: "column",
      height: "calc(100% - 120px)",
      paddingBottom: "1em"
    },
    ".search-results-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "1.5em 1em 1em",
      backgroundColor: theme.vars.palette.grey[800]
    },
    ".search-results-title": {
      fontSize: theme.fontSizeNormal,
      fontFamily: theme.fontFamily2,
      textTransform: "uppercase",
      color: theme.vars.palette.grey[100],
      fontWeight: 500
    },
    ".search-results-count": {
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.grey[200]
    },
    ".search-results-content": {
      flex: 1,
      overflow: "auto",
      paddingBottom: "4em"
    },
    ".search-result-item": {
      display: "flex",
      alignItems: "center",
      padding: "0.75em 1em",
      borderBottom: `1px solid ${theme.vars.palette.grey[800]}`,
      cursor: "grab",
      transition: MOTION.background,
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[800]
      },
      "&.selected": {
        backgroundColor: `${theme.vars.palette.primary.main}22`,
        borderLeft: `3px solid ${"var(--palette-primary-main)"}`
      },
      "&:active": {
        cursor: "grabbing"
      }
    },
    ".result-item-icon": {
      marginRight: "0.75em",
      width: "32px",
      height: "32px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      "& .icon-container": {
        transform: "scale(0.85)",
        opacity: 0.8
      }
    },
    ".result-item-thumbnail": {
      marginRight: "0.75em",
      width: "40px",
      height: "40px",
      borderRadius: BORDER_RADIUS.sm,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      backgroundColor: theme.vars.palette.grey[800],
      border: `1px solid ${theme.vars.palette.grey[600]}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      flexShrink: 0,
      position: "relative",
      "&::after": {
        content: '""',
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        border: `1px solid ${theme.vars.palette.grey[500]}22`,
        borderRadius: BORDER_RADIUS.sm,
        pointerEvents: "none"
      }
    },
    ".result-item-content": {
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      gap: 0
    },
    ".result-item-name": {
      fontSize: theme.fontSizeNormal,
      color: theme.vars.palette.grey[0],
      fontWeight: 500,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      userSelect: "none"
    },
    ".result-item-details": {
      display: "flex",
      alignItems: "center",
      gap: "0.75em",
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.grey[400],
      userSelect: "none"
    },
    ".result-item-location": {
      display: "flex",
      alignItems: "center",
      gap: "0.5em"
    },
    ".folder-breadcrumb": {
      display: "flex",
      alignItems: "center",
      gap: "0.25em",
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.grey[200],
      userSelect: "none"
    },
    ".folder-navigate-btn": {
      minWidth: "auto",
      padding: "0.25em 0.5em",
      fontSize: theme.fontSizeSmaller,
      textTransform: "none",
      color: "var(--palette-primary-main)",
      "&:hover": {
        backgroundColor: "var(--palette-primary-main)" + "22"
      }
    },
    ".result-duration": {
      fontFamily: theme.fontFamily2,
      color: theme.vars.palette.grey[200]
    },
    ".empty-results": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "200px",
      color: theme.vars.palette.grey[400],
      fontSize: theme.fontSizeNormal
    },
    "@keyframes spin": {
      "0%": { transform: "rotate(0deg)" },
      "100%": { transform: "rotate(360deg)" }
    }
  });

const GlobalSearchResults: React.FC<GlobalSearchResultsProps> = ({
  results,
  onAssetDoubleClick,
  onNavigateToFolder,
  containerWidth = 1200
}) => {
  const theme = useTheme();
  const { selectedAssetIds, handleSelectAsset } = useAssetSelection(results);
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const globalSearchQuery = useAssetGridStore(
    (state) => state.globalSearchQuery
  );
  const setSelectedAssetIds = useAssetGridStore(
    (state) => state.setSelectedAssetIds
  );
  const setSelectedAssets = useAssetGridStore(
    (state) => state.setSelectedAssets
  );
  const selectedAssets = useAssetGridStore(
    (state) => state.selectedAssets
  );
  const { isSearching } = useAssetSearch();
  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);

  const dragImageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (dragImageTimeoutRef.current) {
        clearTimeout(dragImageTimeoutRef.current);
      }
    };
  }, []);

  const flexCenterStyle = useMemo(() => ({ display: "flex", alignItems: "center", gap: "0.5em" }), []);
  const spinnerStyle = useMemo(() => ({
    width: "20px",
    height: "20px",
    border: "2px solid " + "var(--palette-grey-500)",
    borderTop: "2px solid var(--palette-grey-100)",
    borderRadius: BORDER_RADIUS.circle,
    animation: `spin ${MOTION.spin} infinite`
  }), []);

  const handleContextMenu = useCallback(
    (event: React.MouseEvent, assetId?: string) => {
      event.preventDefault();
      event.stopPropagation();

      if (assetId) {
        // If right-clicking on a non-selected item, select only that item first
        if (!selectedAssetIds.includes(assetId)) {
          setSelectedAssetIds([assetId]);
          const clicked = results.find((a) => a.id === assetId);
          setSelectedAssets(clicked ? [clicked] : []);
        }
        openContextMenu(
          "asset-item-context-menu",
          assetId,
          event.clientX,
          event.clientY
        );
      }
    },
    [
      openContextMenu,
      selectedAssetIds,
      setSelectedAssetIds,
      setSelectedAssets,
      results
    ]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, asset: AssetWithPath) => {
      let assetIds;

      if (selectedAssetIds && selectedAssetIds.includes(asset.id)) {
        assetIds = selectedAssetIds;
      } else {
        assetIds = [asset.id];
        handleSelectAsset(asset.id);
      }

      if (assetIds.length === 1) {
        serializeDragData(
          {
            type: "asset",
            payload: asset,
            metadata: { sourceId: asset.id }
          },
          e.dataTransfer
        );
      } else {
        const assetsById = new Map(
          [...results, ...(selectedAssets || []), asset].map((a) => [a.id, a])
        );
        const resolvedAssets = assetIds
          .map((id) => assetsById.get(id))
          .filter((a): a is AssetWithPath => a !== undefined);
        serializeDragData(
          {
            type: "assets-multiple",
            payload: assetIds,
            metadata: {
              count: assetIds.length,
              sourceId: asset.id,
              assets: resolvedAssets
            }
          },
          e.dataTransfer
        );
      }

      // Also set legacy single asset key for components that only check "asset"
      // Note: serializeDragData sets "selectedAssetIds" but some code may only check "asset"
      e.dataTransfer.setData("asset", JSON.stringify(asset));

      const dragImage = createAssetDragImage(asset, assetIds.length, selectedAssets || []);
      document.body.appendChild(dragImage);
      e.dataTransfer.setDragImage(dragImage, 10, 10);

      if (dragImageTimeoutRef.current) {
        clearTimeout(dragImageTimeoutRef.current);
      }

      dragImageTimeoutRef.current = setTimeout(() => {
        document.body.removeChild(dragImage);
        dragImageTimeoutRef.current = null;
      }, 0);

      setActiveDrag({
        type: "assets-multiple",
        payload: assetIds,
        metadata: { count: assetIds.length, sourceId: asset.id }
      });
    },
    [selectedAssetIds, handleSelectAsset, setActiveDrag, selectedAssets, results]
  );

  const handleDragEnd = useCallback(() => {
    clearDrag();
  }, [clearDrag]);

  const createAssetHandlers = useCallback(
    (asset: AssetWithPath) => ({
      onDragStart: (e: React.DragEvent) => handleDragStart(e, asset),
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation();
        handleSelectAsset(asset.id);
      },
      onDoubleClick: () => onAssetDoubleClick?.(asset),
      onContextMenu: (e: React.MouseEvent) => handleContextMenu(e, asset.id)
    }),
    [handleDragStart, handleSelectAsset, onAssetDoubleClick, handleContextMenu]
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  const getAssetType = (contentType: string) => {
    return getAssetCategory(contentType);
  };

  const showDetails = containerWidth > 600;

  if (results.length === 0) {
    return (
      <Box
        css={styles(theme)}
        className="global-search-results global-search-empty"
      >
        <div className="global-search-results-container search-results-container">
          <div className="global-search-results-header search-results-header">
            <Text className="global-search-results-title search-results-title">
              Search Results
            </Text>
            <Text className="global-search-results-count search-results-count">
              {isSearching
                ? `Searching for "${globalSearchQuery}"…`
                : `No results for "${globalSearchQuery}"`}
            </Text>
          </div>
          <div
            className="global-search-empty-results empty-results"
            data-testid="global-search-no-results"
          >
            {isSearching ? (
              <div
                style={flexCenterStyle}
              >
                <div
                  className="search-spinner"
                  style={spinnerStyle}
                ></div>
                <Text>Searching…</Text>
              </div>
            ) : (
              <Text>No assets found matching your search.</Text>
            )}
          </div>
        </div>
      </Box>
    );
  }

  return (
    <Box
      css={styles(theme)}
      className="global-search-results global-search-with-results"
      data-testid="global-search-results"
    >
      <div className="global-search-results-container search-results-container">
        <div className="global-search-results-header search-results-header">
          <Text className="global-search-results-title search-results-title">
            Search Results
          </Text>
          <Text className="global-search-results-count search-results-count">
            {results.length} result{results.length !== 1 ? "s" : ""} for &quot;
            {globalSearchQuery}&quot;
          </Text>
        </div>

        <div
          className="global-search-results-content search-results-content"
          data-testid="global-search-results-list"
        >
          {results.map((asset) => {
            const isSelected = selectedAssetIds.includes(asset.id);
            const assetType = getAssetType(asset.content_type);
            const assetSize = asset.size;
            const hasVisualContent =
              (assetType === "image" || assetType === "video") &&
              asset.get_url &&
              asset.get_url !== "/images/placeholder.png";

            const assetHandlers = createAssetHandlers(asset);

            return (
              <div
                key={asset.id}
                className={`global-search-result-item search-result-item ${isSelected ? "selected global-search-selected" : ""
                  }`}
                draggable={true}
                onDragStart={assetHandlers.onDragStart}
                onDragEnd={handleDragEnd}
                onClick={assetHandlers.onClick}
                onDoubleClick={assetHandlers.onDoubleClick}
                onContextMenu={assetHandlers.onContextMenu}
                data-testid={`global-search-result-${asset.id}`}
                data-asset-id={asset.id}
                data-asset-name={asset.name}
              >
                {hasVisualContent ? (
                  <div
                    className="global-search-result-thumbnail result-item-thumbnail"
                    style={{
                      backgroundImage: `url(${asset.thumb_url || asset.get_url
                        })`
                    }}
                    title={`${asset.content_type} thumbnail`}
                    data-testid="global-search-result-thumbnail"
                  />
                ) : (
                  <div className="global-search-result-icon result-item-icon">
                    <IconForType
                      iconName={assetType}
                      showTooltip={false}
                      containerStyle={{
                        width: "32px",
                        height: "32px",
                        transform: "scale(0.85)"
                      }}
                    />
                  </div>
                )}

                <div className="global-search-result-content result-item-content">
                  <div
                    className="global-search-result-name result-item-name"
                    data-testid="global-search-result-name"
                  >
                    {asset.name}
                    {asset.duration && (
                      <span className="global-search-result-duration result-duration">
                        {" "}
                        ({secondsToHMS(asset.duration)})
                      </span>
                    )}
                  </div>

                  {showDetails && (
                    <div className="global-search-result-details result-item-details">
                      {assetSize && assetSize > 0 && (
                        <span className="global-search-result-size">
                          {formatFileSize(assetSize)}
                        </span>
                      )}
                      <span className="global-search-result-date">
                        {formatDate(asset.created_at)}
                      </span>
                      <span className="global-search-result-type">
                        {asset.content_type.split("/")[1] || ""}
                      </span>
                    </div>
                  )}

                  <div className="global-search-result-location result-item-location">
                    <div
                      className="global-search-folder-breadcrumb folder-breadcrumb"
                      data-testid="global-search-folder-path"
                    >
                      <FolderIcon
                        fontSize="small"
                        className="global-search-folder-icon"
                      />
                      <span className="global-search-folder-path">
                        {asset.folder_path}
                      </span>
                    </div>
                    {onNavigateToFolder && (
                      <Tooltip title="Go to folder">
                        <EditorButton
                          className="global-search-navigate-btn folder-navigate-btn"
                          density="compact"
                          variant="text"
                          startIcon={<NavigateIcon fontSize="small" />}
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigateToFolder(
                              asset.folder_id,
                              asset.folder_path
                            );
                          }}
                          data-testid="global-search-navigate-folder"
                          data-folder-id={asset.folder_id}
                        ></EditorButton>
                      </Tooltip>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Box>
  );
};

export default memo(GlobalSearchResults);
