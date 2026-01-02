/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useMemo } from "react";
import { Typography, Box, Button, Tooltip } from "@mui/material";
import {
  Folder as FolderIcon,
  NavigateNext as NavigateIcon
} from "@mui/icons-material";
import { AssetWithPath } from "../../stores/ApiTypes";
import { useAssetSelection } from "../../hooks/assets/useAssetSelection";
import useContextMenuStore from "../../stores/ContextMenuStore";
import { formatFileSize } from "../../utils/formatUtils";
import { secondsToHMS } from "../../utils/formatDateAndTime";
import { IconForType } from "../../config/data_types";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useAssetSearch } from "../../serverState/useAssetSearch";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  serializeDragData,
  createDragCountBadge
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
      transition: "background-color 0.2s",
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
      borderRadius: "4px",
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
        borderRadius: "4px",
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
  // Optimize selection hook to prevent new arrays on every render
  useMemo(
    () => results.map((r) => r.id).join(","),
    [results]
  );

  const memoizedResults = useMemo(() => results, [results]);
  const { selectedAssetIds, handleSelectAsset } =
    useAssetSelection(memoizedResults);
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
  const { isSearching } = useAssetSearch();
  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);

  const handleContextMenu = useCallback(
    (event: React.MouseEvent, assetId?: string) => {
      event.preventDefault();
      event.stopPropagation();

      if (assetId) {
        // If right-clicking on a non-selected item, select only that item first
        if (!selectedAssetIds.includes(assetId)) {
          setSelectedAssetIds([assetId]);
          const clicked = memoizedResults.find((a) => a.id === assetId);
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
      memoizedResults
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

      // Use unified drag serialization
      serializeDragData(
        {
          type: "assets-multiple",
          payload: assetIds,
          metadata: { count: assetIds.length, sourceId: asset.id }
        },
        e.dataTransfer
      );

      // Also set legacy single asset key for components that only check "asset"
      // Note: serializeDragData sets "selectedAssetIds" but some code may only check "asset"
      e.dataTransfer.setData("asset", JSON.stringify(asset));

      // Create and set drag image using the unified utility
      const dragImage = createDragCountBadge(assetIds.length);
      document.body.appendChild(dragImage);
      e.dataTransfer.setDragImage(dragImage, 25, 30);
      setTimeout(() => document.body.removeChild(dragImage), 0);

      // Update global drag state
      setActiveDrag({
        type: "assets-multiple",
        payload: assetIds,
        metadata: { count: assetIds.length, sourceId: asset.id }
      });
    },
    [selectedAssetIds, handleSelectAsset, setActiveDrag]
  );

  const handleDragEnd = useCallback(() => {
    clearDrag();
  }, [clearDrag]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  const getAssetType = (contentType: string) => {
    return contentType.split("/")[0] || "other";
  };

  // Determine which columns to show based on container width
  const showDetails = containerWidth > 600;

  if (results.length === 0) {
    return (
      <Box
        css={styles(theme)}
        className="global-search-results global-search-empty"
      >
        <div className="global-search-results-container search-results-container">
          <div className="global-search-results-header search-results-header">
            <Typography className="global-search-results-title search-results-title">
              Search Results
            </Typography>
            <Typography className="global-search-results-count search-results-count">
              {isSearching
                ? `Searching for "${globalSearchQuery}"...`
                : `No results for "${globalSearchQuery}"`}
            </Typography>
          </div>
          <div
            className="global-search-empty-results empty-results"
            data-testid="global-search-no-results"
          >
            {isSearching ? (
              <div
                style={{ display: "flex", alignItems: "center", gap: "0.5em" }}
              >
                <div
                  className="search-spinner"
                  style={{
                    width: "20px",
                    height: "20px",
                    border: "2px solid var(--palette-grey-500)",
                    borderTop: "2px solid var(--palette-grey-100)",
                    borderRadius: "50%",
                    animation: "spin 1s linear infinite"
                  }}
                ></div>
                <Typography>Searching...</Typography>
              </div>
            ) : (
              <Typography>No assets found matching your search.</Typography>
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
          <Typography className="global-search-results-title search-results-title">
            Search Results
          </Typography>
          <Typography className="global-search-results-count search-results-count">
            {results.length} result{results.length !== 1 ? "s" : ""} for &quot;
            {globalSearchQuery}&quot;
          </Typography>
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

            return (
              <div
                key={asset.id}
                className={`global-search-result-item search-result-item ${
                  isSelected ? "selected global-search-selected" : ""
                }`}
                draggable={true}
                onDragStart={(e) => handleDragStart(e, asset)}
                onDragEnd={handleDragEnd}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectAsset(asset.id);
                }}
                onDoubleClick={() => onAssetDoubleClick?.(asset)}
                onContextMenu={(e) => handleContextMenu(e, asset.id)}
                data-testid={`global-search-result-${asset.id}`}
                data-asset-id={asset.id}
                data-asset-name={asset.name}
              >
                {hasVisualContent ? (
                  <div
                    className="global-search-result-thumbnail result-item-thumbnail"
                    style={{
                      backgroundImage: `url(${
                        asset.thumb_url || asset.get_url
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
                        <Button
                          className="global-search-navigate-btn folder-navigate-btn"
                          size="small"
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
                        ></Button>
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

export default GlobalSearchResults;
