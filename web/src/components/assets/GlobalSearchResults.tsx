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

interface GlobalSearchResultsProps {
  results: AssetWithPath[];
  onAssetDoubleClick?: (asset: AssetWithPath) => void;
  onNavigateToFolder?: (folderId: string, folderPath: string) => void;
  containerWidth?: number;
}

const styles = (theme: any) =>
  css({
    "&": {
      width: "100%",
      height: "100%"
    },
    ".search-results-container": {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      paddingBottom: "1em"
    },
    ".search-results-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "1.5em 1em 1em",
      borderBottom: `1px solid ${theme.palette.c_gray2}`,
      backgroundColor: theme.palette.c_gray0 + "80"
    },
    ".search-results-title": {
      fontSize: theme.fontSizeNormal,
      color: theme.palette.c_white,
      fontWeight: 500
    },
    ".search-results-count": {
      fontSize: theme.fontSizeSmaller,
      color: theme.palette.c_gray4
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
      borderBottom: `1px solid ${theme.palette.c_gray1}`,
      cursor: "pointer",
      transition: "background-color 0.2s",
      "&:hover": {
        backgroundColor: theme.palette.c_gray1
      },
      "&.selected": {
        backgroundColor: theme.palette.c_hl1 + "22",
        borderLeft: `3px solid ${theme.palette.c_hl1}`
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
      backgroundColor: theme.palette.c_gray1,
      border: `1px solid ${theme.palette.c_gray2}`,
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
        border: `1px solid ${theme.palette.c_gray3}22`,
        borderRadius: "4px",
        pointerEvents: "none"
      }
    },
    ".result-item-content": {
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      gap: "0.25em"
    },
    ".result-item-name": {
      fontSize: theme.fontSizeNormal,
      color: theme.palette.c_white,
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
      color: theme.palette.c_gray4,
      userSelect: "none"
    },
    ".result-item-location": {
      display: "flex",
      alignItems: "center",
      gap: "0.5em",
      marginTop: "0.25em"
    },
    ".folder-breadcrumb": {
      display: "flex",
      alignItems: "center",
      gap: "0.25em",
      fontSize: theme.fontSizeSmaller,
      color: theme.palette.c_gray5,
      userSelect: "none"
    },
    ".folder-navigate-btn": {
      minWidth: "auto",
      padding: "0.25em 0.5em",
      fontSize: theme.fontSizeSmaller,
      textTransform: "none",
      color: theme.palette.c_hl1,
      "&:hover": {
        backgroundColor: theme.palette.c_hl1 + "22"
      }
    },
    ".result-duration": {
      fontFamily: theme.fontFamily2,
      color: theme.palette.c_gray5
    },
    ".empty-results": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "200px",
      color: theme.palette.c_gray4,
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
  // Optimize selection hook to prevent new arrays on every render
  const memoizedResults = useMemo(
    () => results,
    [results.map((r) => r.id).join(",")]
  );
  const { selectedAssetIds, handleSelectAsset } =
    useAssetSelection(memoizedResults);
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const globalSearchQuery = useAssetGridStore(
    (state) => state.globalSearchQuery
  );
  const { isSearching } = useAssetSearch();

  const handleContextMenu = useCallback(
    (event: React.MouseEvent, assetId?: string) => {
      event.preventDefault();
      event.stopPropagation();

      if (assetId) {
        openContextMenu(
          "asset-item-context-menu",
          assetId,
          event.clientX,
          event.clientY
        );
      }
    },
    [openContextMenu]
  );

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
      <Box css={styles} className="global-search-results global-search-empty">
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
                    border: "2px solid var(--c_gray3)",
                    borderTop: "2px solid var(--c_gray6)",
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
      css={styles}
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
