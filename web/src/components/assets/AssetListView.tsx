/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useMemo, useRef, useState, useEffect, memo } from "react";
import { Typography, Box } from "@mui/material";
import AutoSizer from "react-virtualized-auto-sizer";
import { VariableSizeList as List } from "react-window";
import { Asset } from "../../stores/ApiTypes";
import { useAssetSelection } from "../../hooks/assets/useAssetSelection";
import useContextMenuStore from "../../stores/ContextMenuStore";
import { formatFileSize } from "../../utils/formatUtils";
import { secondsToHMS } from "../../utils/formatDateAndTime";
import { IconForType } from "../../config/data_types";
import FolderIcon from "@mui/icons-material/Folder";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { ExpandCollapseButton } from "../ui_primitives";

interface AssetListViewProps {
  assets: Asset[];
  onDoubleClick?: (_asset: Asset) => void;
  containerWidth?: number;
  isHorizontal?: boolean;
}

const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 50;
const TYPE_SECTION_HEIGHT = 36;

// Type for virtual list item data
type VirtualListItemData =
  | { type: 'header'; key: string; data: { type: string; count: number; isExpanded: boolean } }
  | { type: 'asset'; key: string; data: { asset: Asset } };

// Define typeMap outside the component to avoid recreation
const TYPE_MAP: Record<string, string> = {
  folder: "Folder",
  image: "Images",
  video: "Videos",
  audio: "Audio",
  text: "Text",
  application: "Files",
  other: "Other"
};

const styles = (theme: Theme) =>
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
      color: theme.vars.palette.grey[400],
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
      overflow: "hidden"
    },
    ".asset-virtual-list": {
      paddingBottom: "14em"
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
        backgroundColor: theme.vars.palette.grey[800]
      }
    },
    ".asset-content-type-title": {
      fontSize: theme.fontSizeNormal,
      color: theme.vars.palette.grey[100],
      textTransform: "uppercase",
      marginLeft: "0.5em",
      flex: 1
    },
    ".asset-list-item": {
      display: "flex",
      alignItems: "center",
      padding: "0.2em 1em",
      borderBottom: `1px solid ${theme.vars.palette.grey[800]}`,
      cursor: "pointer",
      transition: "background-color 0.2s",
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[800]
      },
      "&.selected": {
        backgroundColor: "var(--palette-primary-main)" + "22",
        borderLeft: `1px solid ${"var(--palette-primary-main)"}`
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
        color: theme.vars.palette.grey[200] + " !important",
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
        borderRadius: "3px",
        pointerEvents: "none"
      }
    },
    ".asset-item-name": {
      flex: "1 1 200px",
      minWidth: "150px",
      fontSize: theme.fontSizeNormal,
      userSelect: "none",
      color: theme.vars.palette.grey[0],
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".asset-item-name.folder": {
      fontWeight: 500,
      color: "var(--palette-primary-main)"
    },
    ".asset-item-size": {
      flex: "0 0 80px",
      textAlign: "right",
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.grey[400]
    },
    ".asset-item-type": {
      flex: "0 0 100px",
      textAlign: "center",
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.grey[400]
    },
    ".asset-item-date": {
      flex: "0 0 120px",
      textAlign: "right",
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.grey[400]
    },
    ".asset-item-duration": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.grey[200],
      marginLeft: "1em"
    }
  });

const AssetListView: React.FC<AssetListViewProps> = memo(({
  assets,
  onDoubleClick,
  containerWidth = 1200,
  isHorizontal = false
}) => {
  const theme = useTheme();
  const { selectedAssetIds, handleSelectAsset, handleDeselectAssets } =
    useAssetSelection(assets);
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const listRef = useRef<List>(null);

  // Keep track of selected IDs in a ref to avoid recreating renderRow when selection changes
  const selectedAssetIdsRef = useRef(selectedAssetIds);
  useEffect(() => {
    selectedAssetIdsRef.current = selectedAssetIds;
  }, [selectedAssetIds]);

  // Memoize asset signature for change detection
  useMemo(
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

    return grouped;
  }, [assets]);

  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(
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

  // Create a flat list of items for virtualization (alternating headers and assets)
  const virtualListItems = useMemo(() => {
    const items: VirtualListItemData[] = [];
    
    Object.entries(assetsByType).forEach(([type, typeAssets]) => {
      const isExpanded = expandedTypes.has(type);
      
      // Add type header
      items.push({
        type: 'header',
        key: `header-${type}`,
        data: { type, count: typeAssets.length, isExpanded }
      });
      
      // Add assets if expanded
      if (isExpanded) {
        typeAssets.forEach((asset) => {
          items.push({
            type: 'asset',
            key: `asset-${asset.id}`,
            data: { asset }
          });
        });
      }
    });
    
    return items;
  }, [assetsByType, expandedTypes]);

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

  const formatDate = useCallback((dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  }, []);

  const getTypeDisplayName = useCallback((type: string) => {
    return TYPE_MAP[type] || type.charAt(0).toUpperCase() + type.slice(1);
  }, []);

  // Determine which columns to show based on container width and layout
  // In horizontal layout, be more aggressive about hiding columns
  const sizeThreshold = isHorizontal ? 500 : 600;
  const typeThreshold = isHorizontal ? 700 : 800;
  const dateThreshold = isHorizontal ? 900 : 1000;

  const showSize = containerWidth > sizeThreshold;
  const showType = containerWidth > typeThreshold;
  const showDate = containerWidth > dateThreshold;

  // Empty callback for disabled button - prevents new function creation on each render
  const emptyCallback = useCallback(() => {}, []);

  const getRowHeight = useCallback((index: number) => {
    const item = virtualListItems[index];
    if (item?.type === 'header') {
      return TYPE_SECTION_HEIGHT;
    }
    return ROW_HEIGHT;
  }, [virtualListItems]);

  // Reset list when data changes
  useEffect(() => {
    if (listRef.current) {
      listRef.current.resetAfterIndex(0);
    }
  }, [virtualListItems.length, expandedTypes]);

  // Force re-render when selection changes to update selected state
  useEffect(() => {
    if (listRef.current) {
      listRef.current.resetAfterIndex(0);
    }
  }, [selectedAssetIds]);

  // Render a single row in the virtualized list
  const renderRow = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const item = virtualListItems[index];
    
    if (!item) {
      return null;
    }

    if (item.type === 'header') {
      const { type, count, isExpanded } = item.data;
      return (
        <div
          style={style}
          className="asset-content-type-header"
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
            {getTypeDisplayName(type)} ({count})
          </Typography>
          <ExpandCollapseButton
            expanded={isExpanded}
            onClick={emptyCallback}
            size="small"
            nodrag={false}
            sx={{ pointerEvents: 'none' }}
          />
        </div>
      );
    }

    // Render asset item
    const { asset } = item.data;
    // Use ref to avoid recreating renderRow when selection changes
    const isSelected = selectedAssetIdsRef.current.includes(asset.id);
    const isFolder = asset.content_type === "folder";
    const assetSize = asset.size;
    const hasVisualContent =
      (asset.content_type?.startsWith("image/") || asset.content_type?.startsWith("video/")) &&
      asset.get_url &&
      asset.get_url !== "/images/placeholder.png";

    return (
      <div
        className={`asset-list-item ${isSelected ? "selected" : ""}`}
        style={style}
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
              backgroundImage: `url(${asset.thumb_url || asset.get_url})`
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
                iconName={asset.content_type?.split("/")[0] || "other"}
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
          className={`asset-item-name ${isFolder ? "folder" : ""}`}
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
              : asset.content_type?.split("/")[1] || "Unknown"}
          </div>
        )}

        {showDate && (
          <div className="asset-item-date">
            {formatDate(asset.created_at)}
          </div>
        )}
      </div>
    );
  }, [virtualListItems, handleSelectAsset, onDoubleClick, handleContextMenu, toggleExpanded, showSize, showType, showDate, emptyCallback, formatDate, getTypeDisplayName]);

  if (assets.length === 0) {
    return (
      <Box css={styles(theme)} className="asset-list-view">
        <Typography
          variant="body2"
          style={{ textAlign: "center", padding: "2em", color: "var(--palette-text-secondary)" }}
        >
          No assets to display
        </Typography>
      </Box>
    );
  }

  return (
    <Box css={styles(theme)} className="asset-list-view">
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
            if (e.target === e.currentTarget) {
              handleDeselectAssets();
            }
          }}
        >
          <AutoSizer>
            {({ height, width }: { height: number; width: number }) => (
              <List
                ref={listRef}
                className="asset-virtual-list"
                height={height - HEADER_HEIGHT}
                itemCount={virtualListItems.length}
                itemSize={getRowHeight}
                width={width}
              >
                {renderRow}
              </List>
            )}
          </AutoSizer>
        </div>
      </div>
    </Box>
  );
});

AssetListView.displayName = 'AssetListView';

export default memo(AssetListView);
