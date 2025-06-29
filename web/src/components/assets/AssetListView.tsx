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
    ".list-container": {
      display: "flex",
      flexDirection: "column",
      height: "100%"
    },
    ".list-header": {
      display: "flex",
      alignItems: "center",
      padding: "0.5em 1em",
      backgroundColor: theme.palette.c_gray1,
      borderBottom: `1px solid ${theme.palette.c_gray2}`,
      fontSize: theme.fontSizeSmaller,
      fontWeight: 600,
      color: theme.palette.c_gray5,
      textTransform: "uppercase",
      position: "sticky",
      top: 0,
      zIndex: 1
    },
    ".header-name": {
      flex: "1 1 200px",
      minWidth: "150px"
    },
    ".header-size": {
      flex: "0 0 80px",
      textAlign: "right"
    },
    ".header-type": {
      flex: "0 0 100px",
      textAlign: "center"
    },
    ".header-date": {
      flex: "0 0 120px",
      textAlign: "right"
    },
    ".list-content": {
      flex: 1,
      overflow: "auto"
    },
    ".content-type-section": {
      marginBottom: "1em"
    },
    ".content-type-header": {
      display: "flex",
      alignItems: "center",
      padding: "0.5em 1em",
      backgroundColor: theme.palette.c_gray0,
      borderLeft: "4px solid",
      cursor: "pointer",
      "&:hover": {
        backgroundColor: theme.palette.c_gray1
      }
    },
    ".content-type-title": {
      fontSize: theme.fontSizeSmaller,
      fontWeight: 600,
      color: theme.palette.c_white,
      textTransform: "uppercase",
      marginLeft: "0.5em",
      flex: 1
    },
    ".asset-list-item": {
      display: "flex",
      alignItems: "center",
      padding: "0.5em 1em",
      borderBottom: `1px solid ${theme.palette.c_gray1}`,
      cursor: "pointer",
      transition: "background-color 0.2s",
      "&:hover": {
        backgroundColor: theme.palette.c_gray1
      },
      "&.selected": {
        backgroundColor: theme.palette.c_hl1 + "22",
        borderColor: theme.palette.c_hl1
      }
    },
    ".item-icon": {
      marginRight: "0.75em",
      width: "24px",
      height: "24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    },
    ".item-name": {
      flex: "1 1 200px",
      minWidth: "150px",
      fontSize: theme.fontSizeNormal,
      color: theme.palette.c_white,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".item-name.folder": {
      fontWeight: 500,
      color: theme.palette.c_hl1
    },
    ".item-size": {
      flex: "0 0 80px",
      textAlign: "right",
      fontSize: theme.fontSizeSmaller,
      color: theme.palette.c_gray4
    },
    ".item-type": {
      flex: "0 0 100px",
      textAlign: "center",
      fontSize: theme.fontSizeSmaller,
      color: theme.palette.c_gray4
    },
    ".item-date": {
      flex: "0 0 120px",
      textAlign: "right",
      fontSize: theme.fontSizeSmaller,
      color: theme.palette.c_gray4
    },
    ".item-duration": {
      fontSize: theme.fontSizeTiny,
      color: theme.palette.c_gray3,
      marginLeft: "0.5em"
    }
  });

const AssetListView: React.FC<AssetListViewProps> = ({
  assets,
  onDoubleClick,
  containerWidth = 1200,
  isHorizontal = false
}) => {
  const { selectedAssetIds, handleSelectAsset } = useAssetSelection(assets);
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);

  // Group assets by content type
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
      <div className="list-container">
        <div className="list-header">
          <div className="header-name">Name</div>
          {showSize && <div className="header-size">Size</div>}
          {showType && <div className="header-type">Type</div>}
          {showDate && <div className="header-date">Modified</div>}
        </div>

        <div
          className="list-content"
          onContextMenu={(e) => handleContextMenu(e)}
        >
          {Object.entries(assetsByType).map(([type, typeAssets]) => (
            <div key={type} className="content-type-section">
              <div
                className="content-type-header"
                style={{ borderLeftColor: colorForType(type) }}
                onClick={() => toggleExpanded(type)}
              >
                <IconForType
                  iconName={type}
                  showTooltip={false}
                  containerStyle={{ marginRight: "0.5em" }}
                />
                <Typography className="content-type-title">
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
                  const assetSize = (asset as any).size as number | undefined;

                  return (
                    <div
                      key={asset.id}
                      className={`asset-list-item ${
                        isSelected ? "selected" : ""
                      }`}
                      onClick={() => handleSelectAsset(asset.id)}
                      onDoubleClick={() => onDoubleClick?.(asset)}
                      onContextMenu={(e) => handleContextMenu(e, asset.id)}
                    >
                      <div className="item-icon">
                        {isFolder ? (
                          <FolderIcon
                            style={{ color: colorForType("folder") }}
                          />
                        ) : (
                          <IconForType
                            iconName={type}
                            showTooltip={false}
                            containerStyle={{ width: "24px", height: "24px" }}
                          />
                        )}
                      </div>

                      <div className={`item-name ${isFolder ? "folder" : ""}`}>
                        {asset.name}
                        {asset.duration && (
                          <span className="item-duration">
                            ({secondsToHMS(asset.duration)})
                          </span>
                        )}
                      </div>

                      {showSize && (
                        <div className="item-size">
                          {!isFolder && assetSize && assetSize > 0
                            ? formatFileSize(assetSize)
                            : "--"}
                        </div>
                      )}

                      {showType && (
                        <div className="item-type">
                          {isFolder
                            ? "Folder"
                            : asset.content_type.split("/")[1] || "Unknown"}
                        </div>
                      )}

                      {showDate && (
                        <div className="item-date">
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
