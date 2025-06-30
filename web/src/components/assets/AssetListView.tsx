/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useMemo } from "react";
import { Typography, Box, IconButton } from "@mui/material";
import { Asset } from "../../stores/ApiTypes";
import { useAssetSelection } from "../../hooks/assets/useAssetSelection";
import useContextMenuStore from "../../stores/ContextMenuStore";
import { formatFileSize } from "../../utils/formatUtils";
import { secondsToHMS } from "../../utils/formatDateAndTime";
import { colorForType, IconForType } from "../../config/data_types";
import FolderIcon from "@mui/icons-material/Folder";
import { ExpandLess, ExpandMore } from "@mui/icons-material";

interface AssetListViewProps {
  assets: Asset[];
  onDoubleClick?: (asset: Asset) => void;
  containerWidth?: number;
  isHorizontal?: boolean;
}

const styles = (theme: any) =>
  css({
    "&": {
      width: "100%",
      height: "100%"
    },
    ".asset-list-container": {
      display: "flex",
      flexDirection: "column",
      height: "100%"
    },
    ".asset-list-header": {
      display: "flex",
      alignItems: "center",
      padding: "2em 1em 1em",
      color: theme.palette.grey[400],
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      textTransform: "uppercase",
      position: "sticky",
      top: 0,
      zIndex: 1
    },
    ".asset-header-icon-space": {
      width: "32px",
      marginRight: "0.75em",
      flexShrink: 0
    },
    ".asset-header-name": {
      flex: "1 1 200px",
      minWidth: "150px"
    },
    ".asset-header-size": {
      flex: "0 0 80px",
      textAlign: "right"
    },
    ".asset-header-type": {
      flex: "0 0 100px",
      textAlign: "center"
    },
    ".asset-header-date": {
      flex: "0 0 120px",
      textAlign: "right"
    },
    ".asset-list-content": {
      flex: 1,
      overflow: "auto"
    },
    ".asset-content-type-section": {
      marginBottom: "1em"
    },
    ".asset-content-type-header": {
      display: "flex",
      alignItems: "center",
      padding: "0.25em 1em",
      marginBottom: "0.5em",
      backgroundColor: "transparent",
      borderBottom: "2px solid ",
      cursor: "pointer",
      "&:hover": {
        backgroundColor: theme.palette.grey[800]
      }
    },
    ".asset-content-type-title": {
      fontSize: theme.fontSizeNormal,
      color: theme.palette.grey[100],
      textTransform: "uppercase",
      marginLeft: "0.5em",
      flex: 1
    },
    ".asset-list-item": {
      display: "flex",
      alignItems: "center",
      padding: "0.2em 1em",
      borderBottom: `1px solid ${theme.palette.grey[800]}`,
      cursor: "pointer",
      transition: "background-color 0.2s",
      "&:hover": {
        backgroundColor: theme.palette.grey[800]
      },
      "&.selected": {
        backgroundColor: theme.palette.c_hl1 + "22",
        borderLeft: `1px solid ${theme.palette.c_hl1}`
      }
    },
    ".asset-item-icon": {
      marginRight: "0.75em",
      width: "24px",
      height: "24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      "& .icon-container": {
        transform: "scale(0.75)",
        opacity: 0.7
      },
      "& svg": {
        color: theme.palette.grey[200] + " !important",
        fontSize: "1.2rem"
      }
    },
    ".asset-item-thumbnail": {
      marginRight: "0.75em",
      width: "32px",
      height: "32px",
      borderRadius: "3px",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      backgroundColor: theme.palette.grey[800],
      border: `1px solid ${theme.palette.grey[600]}`,
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
        border: `1px solid ${theme.palette.grey[500]}22`,
        borderRadius: "3px",
        pointerEvents: "none"
      }
    },
    ".asset-item-name": {
      flex: "1 1 200px",
      minWidth: "150px",
      fontSize: theme.fontSizeNormal,
      userSelect: "none",
      color: theme.palette.c_white,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".asset-item-name.folder": {
      fontWeight: 500,
      color: theme.palette.c_hl1
    },
    ".asset-item-size": {
      flex: "0 0 80px",
      textAlign: "right",
      fontSize: theme.fontSizeSmaller,
      color: theme.palette.grey[400]
    },
    ".asset-item-type": {
      flex: "0 0 100px",
      textAlign: "center",
      fontSize: theme.fontSizeSmaller,
      color: theme.palette.grey[400]
    },
    ".asset-item-date": {
      flex: "0 0 120px",
      textAlign: "right",
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      color: theme.palette.grey[400]
    },
    ".asset-item-duration": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      color: theme.palette.grey[200],
      marginLeft: "1em"
    }
  });

const AssetListView: React.FC<AssetListViewProps> = ({
  assets,
  onDoubleClick,
  containerWidth = 1200,
  isHorizontal = false
}) => {
  const { selectedAssetIds, handleSelectAsset, handleDeselectAssets } =
    useAssetSelection(assets);
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);

  // Group assets by content type - optimized with stable asset signature
  const assetSignature = useMemo(
    () =>
      assets
        .map((asset) => `${asset.id}-${asset.name}-${asset.content_type}`)
        .join(","),
    [assets]
  );

  const assetsByType = useMemo(() => {
    const grouped: Record<string, Asset[]> = {};

    assets.forEach((asset) => {
      const type =
        asset.content_type === "folder"
          ? "folder"
          : asset.content_type.split("/")[0] || "other";

      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push(asset);
    });

    // Sort each group by name
    Object.keys(grouped).forEach((type) => {
      grouped[type].sort((a, b) => a.name.localeCompare(b.name));
    });

    return grouped;
  }, [assets]);

  const [expandedTypes, setExpandedTypes] = React.useState<Set<string>>(
    new Set(["folder", "image", "audio", "video", "text", "other"])
  );

  const toggleExpanded = useCallback((type: string) => {
    setExpandedTypes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(type)) {
        newSet.delete(type);
      } else {
        newSet.add(type);
      }
      return newSet;
    });
  }, []);

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
      } else {
        openContextMenu(
          "asset-grid-context-menu",
          "",
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

  const getTypeDisplayName = (type: string) => {
    const typeMap: Record<string, string> = {
      folder: "Folder",
      image: "Images",
      video: "Videos",
      audio: "Audio",
      text: "Text",
      application: "Files",
      other: "Other"
    };
    return typeMap[type] || type.charAt(0).toUpperCase() + type.slice(1);
  };

  // Determine which columns to show based on container width and layout
  // In horizontal layout, be more aggressive about hiding columns
  const sizeThreshold = isHorizontal ? 500 : 600;
  const typeThreshold = isHorizontal ? 700 : 800;
  const dateThreshold = isHorizontal ? 900 : 1000;

  const showSize = containerWidth > sizeThreshold;
  const showType = containerWidth > typeThreshold;
  const showDate = containerWidth > dateThreshold;

  if (assets.length === 0) {
    return (
      <Box css={styles} className="asset-list-view">
        <Typography
          variant="body2"
          style={{ textAlign: "center", padding: "2em", color: "#999" }}
        >
          No assets to display
        </Typography>
      </Box>
    );
  }

  return (
    <Box css={styles} className="asset-list-view">
      <div className="asset-list-container">
        <div className="asset-list-header">
          <div className="asset-header-icon-space"></div>
          <div className="asset-header-name">Name</div>
          {showSize && <div className="asset-header-size">Size</div>}
          {showType && <div className="asset-header-type">Type</div>}
          {showDate && <div className="asset-header-date">Modified</div>}
        </div>

        <div
          className="asset-list-content"
          onContextMenu={(e) => handleContextMenu(e)}
          onClick={(e) => {
            // Only deselect if clicking on empty space (the target is the content div itself)
            if (e.target === e.currentTarget) {
              handleDeselectAssets();
            }
          }}
        >
          {Object.entries(assetsByType).map(([type, typeAssets]) => (
            <div key={type} className="asset-content-type-section">
              <div
                className="asset-content-type-header"
                style={{ borderBottomColor: colorForType(type) }}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpanded(type);
                }}
              >
                <IconForType
                  iconName={type}
                  showTooltip={false}
                  containerStyle={{
                    width: "24px",
                    height: "24px",
                    marginRight: "0.5em"
                  }}
                />
                <Typography className="asset-content-type-title">
                  {getTypeDisplayName(type)} ({typeAssets.length})
                </Typography>
                <IconButton size="small" tabIndex={-1}>
                  {expandedTypes.has(type) ? <ExpandLess /> : <ExpandMore />}
                </IconButton>
              </div>

              {expandedTypes.has(type) &&
                typeAssets.map((asset) => {
                  const isSelected = selectedAssetIds.includes(asset.id);
                  const isFolder = asset.content_type === "folder";
                  const assetSize = asset.size;
                  const hasVisualContent =
                    (type === "image" || type === "video") &&
                    asset.get_url &&
                    asset.get_url !== "/images/placeholder.png";

                  return (
                    <div
                      key={asset.id}
                      className={`asset-list-item ${
                        isSelected ? "selected" : ""
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectAsset(asset.id);
                      }}
                      onDoubleClick={() => onDoubleClick?.(asset)}
                      onContextMenu={(e) => handleContextMenu(e, asset.id)}
                    >
                      {hasVisualContent ? (
                        <div
                          className="asset-item-thumbnail"
                          style={{
                            backgroundImage: `url(${
                              asset.thumb_url || asset.get_url
                            })`
                          }}
                          title={`${asset.content_type} thumbnail`}
                        />
                      ) : (
                        <div className="asset-item-icon">
                          {isFolder ? (
                            <FolderIcon
                              style={{
                                color: "var(--palette-grey-200)",
                                fontSize: "1.2rem"
                              }}
                            />
                          ) : (
                            <IconForType
                              iconName={type}
                              showTooltip={false}
                              containerStyle={{
                                width: "24px",
                                height: "24px",
                                transform: "scale(0.85)"
                              }}
                            />
                          )}
                        </div>
                      )}

                      <div
                        className={`asset-item-name ${
                          isFolder ? "folder" : ""
                        }`}
                      >
                        {asset.name}
                        {asset.duration && (
                          <span className="asset-item-duration">
                            {secondsToHMS(asset.duration)}
                          </span>
                        )}
                      </div>

                      {showSize && (
                        <div className="asset-item-size">
                          {!isFolder && assetSize && assetSize > 0
                            ? formatFileSize(assetSize)
                            : "--"}
                        </div>
                      )}

                      {showType && (
                        <div className="asset-item-type">
                          {isFolder
                            ? "Folder"
                            : asset.content_type.split("/")[1] || "Unknown"}
                        </div>
                      )}

                      {showDate && (
                        <div className="asset-item-date">
                          {formatDate(asset.created_at)}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </Box>
  );
};

export default AssetListView;
