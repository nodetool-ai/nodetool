/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import { VariableSizeList as List } from "react-window";
import { useSettingsStore } from "../../stores/SettingsStore";
import useAssets from "../../serverState/useAssets";
import { Asset } from "../../stores/ApiTypes";
import AssetGridRow from "./AssetGridRow";
import {
  getFooterHeight,
  calculateGridDimensions,
  prepareItems,
  calculateRowCount,
  getItemsForRow,
  getExtraFooterSpace,
  DIVIDER_HEIGHT
} from "./assetGridUtils";
import { useAssetSelection } from "../../hooks/assets/useAssetSelection";
import useContextMenuStore from "../../stores/ContextMenuStore";
import ThemeNodetool from "../themes/ThemeNodetool";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import AssetListView from "./AssetListView";

const styles = (theme: any) =>
  css({
    "&": {
      position: "relative",
      height: "100%",
      overflow: "hidden",
      paddingBottom: ".5em",
      display: "flex",
      flexDirection: "column"
    },
    ".asset-list": {
      flex: 1,
      overflow: "hidden"
    },
    ".autosizer-list": {
      paddingBottom: "14em"
    },
    ".content-type-header": {
      width: "100%",
      padding: "0.5em 0",
      backgroundColor: "transparent",
      fontSize: theme.fontSizeSmall,
      textTransform: "uppercase"
    },
    ".content-type-header button": {
      opacity: 0.6
    },
    ".content-type-header:hover button": {
      opacity: 1
    },
    ".divider": {
      width: "100%",
      height: "2px",
      backgroundColor: theme.palette.divider
    }
  });

interface AssetGridContentProps {
  itemSpacing?: number;
  assets?: Asset[];
  isHorizontal?: boolean;
  onDoubleClick?: (asset: Asset) => void;
}

const AssetGridContent: React.FC<AssetGridContentProps> = ({
  itemSpacing = 2,
  assets: propAssets,
  isHorizontal,
  onDoubleClick
}) => {
  const { folderFilesFiltered } = useAssets();
  const assetItemSize = useSettingsStore(
    (state) => state.settings.assetItemSize
  );
  const assets = useMemo(() => {
    if (propAssets) return propAssets;
    return folderFilesFiltered || [];
  }, [propAssets, folderFilesFiltered]);

  const { selectedAssetIds, handleSelectAsset } = useAssetSelection(assets);
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const viewMode = useAssetGridStore((state) => state.viewMode);

  const [gridDimensions, setGridDimensions] = useState({
    columns: 1,
    itemWidth: 0,
    itemHeight: 0
  });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const listRef = useRef<List>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const footerHeight = useMemo(
    () => getFooterHeight(assetItemSize),
    [assetItemSize]
  );

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

  const preparedItems = useMemo(() => {
    const prepared = prepareItems(assets || [], expandedTypes);
    return prepared;
  }, [assets, expandedTypes]);

  const updateGridDimensions = useCallback(
    (width: number) => {
      if (width > 0) {
        const dimensions = calculateGridDimensions(
          width,
          assetItemSize,
          itemSpacing
        );
        setGridDimensions((prevDimensions) => {
          if (
            prevDimensions.columns !== dimensions.columns ||
            prevDimensions.itemWidth !== dimensions.itemWidth ||
            prevDimensions.itemHeight !== dimensions.itemHeight
          ) {
            return dimensions;
          }
          return prevDimensions;
        });
      }
    },
    [assetItemSize, itemSpacing]
  );

  const rowCount = useMemo(
    () => calculateRowCount(preparedItems, gridDimensions.columns),
    [preparedItems, gridDimensions.columns]
  );

  const onDragStart = useCallback(
    (assetId: string): string[] => [...selectedAssetIds, assetId],
    [selectedAssetIds]
  );

  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      // Only show context menu if clicking on the grid content itself,
      // not on asset items or other elements
      const target = event.target as HTMLElement;
      const isGridContentArea =
        target.classList.contains("asset-grid-content") ||
        target.classList.contains("asset-list") ||
        target.classList.contains("autosizer-list");

      if (isGridContentArea) {
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

  const getRowHeight = useCallback(
    (index: number) => {
      const rowItems = getItemsForRow(
        preparedItems,
        index,
        gridDimensions.columns
      );
      if (rowItems[0]?.isDivider) {
        return DIVIDER_HEIGHT;
      }
      const type = rowItems[0]?.type;
      if (type && !expandedTypes.has(type)) {
        return 0; // Hide collapsed rows
      }
      // Add extra space for filenames when item size is large (matching AssetGridRow logic)
      const extraFooterSpace = getExtraFooterSpace(assetItemSize);
      return (
        gridDimensions.itemHeight +
        footerHeight +
        extraFooterSpace +
        itemSpacing * 2
      );
    },
    [
      preparedItems,
      gridDimensions,
      footerHeight,
      itemSpacing,
      expandedTypes,
      assetItemSize
    ]
  );

  // Separate stable data from selection state to prevent unnecessary re-renders
  const stableItemData = useMemo(() => {
    const data = {
      getItemsForRow: (index: number) =>
        getItemsForRow(preparedItems, index, gridDimensions.columns),
      gridDimensions,
      footerHeight,
      itemSpacing,
      assetItemSize,
      handleSelectAsset,
      onDragStart,
      onDoubleClick: onDoubleClick || (() => {}),
      expandedTypes,
      toggleExpanded
    };
    return data;
  }, [
    preparedItems,
    gridDimensions,
    footerHeight,
    itemSpacing,
    assetItemSize,
    handleSelectAsset,
    onDragStart,
    onDoubleClick,
    expandedTypes,
    toggleExpanded
    // Note: selectedAssetIds is NOT included here!
  ]);

  // Create a selection context that changes less frequently
  const selectionData = useMemo(() => {
    const data = { selectedAssetIds };
    return data;
  }, [selectedAssetIds]);

  // Combine stable and selection data
  const itemData = useMemo(() => {
    const data = {
      ...stableItemData,
      ...selectionData
    };
    return data;
  }, [stableItemData, selectionData]);

  // useEffect(() => {
  //   if (!propAssets) {
  //     fetchAssets().then(() => {});
  //   }
  // }, [selectedFolderId, fetchAssets, propAssets, assets]);

  useEffect(() => {
    if (containerRef.current) {
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerSize({
            width: entry.contentRect.width,
            height: entry.contentRect.height
          });
        }
      });

      resizeObserver.observe(containerRef.current);

      return () => {
        resizeObserver.disconnect();
      };
    }
  }, []);

  useEffect(() => {
    updateGridDimensions(containerSize.width);
  }, [containerSize, updateGridDimensions]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.resetAfterIndex(0);
    }
  }, [gridDimensions, assetItemSize, preparedItems]);

  // If list view is selected, render AssetListView instead
  if (viewMode === "list") {
    return (
      <div
        className="asset-grid-content"
        css={styles}
        ref={containerRef}
        onContextMenu={handleContextMenu}
        style={{
          width: "100%",
          height: "100%",
          borderLeft: isHorizontal
            ? "1px solid" + ThemeNodetool.palette.c_gray2
            : "none",
          paddingLeft: isHorizontal ? ".5em" : "0"
        }}
      >
        <AutoSizer>
          {({ height, width }: { height: number; width: number }) => (
            <div style={{ width, height }}>
              <AssetListView
                assets={assets}
                onDoubleClick={onDoubleClick}
                containerWidth={width}
                isHorizontal={isHorizontal}
              />
            </div>
          )}
        </AutoSizer>
      </div>
    );
  }

  // Default grid view
  return (
    <div
      className="asset-grid-content"
      css={styles}
      ref={containerRef}
      onContextMenu={handleContextMenu}
      style={{
        width: "100%",
        height: "100%",
        borderLeft: isHorizontal
          ? "1px solid" + ThemeNodetool.palette.c_gray2
          : "none",
        paddingLeft: isHorizontal ? ".5em" : "0"
      }}
    >
      <div className="asset-list">
        <AutoSizer>
          {({ height, width }: { height: number; width: number }) => {
            return (
              <List
                ref={listRef}
                className="autosizer-list"
                height={height}
                itemCount={rowCount}
                itemSize={getRowHeight}
                width={width}
                itemData={itemData}
              >
                {AssetGridRow}
              </List>
            );
          }}
        </AutoSizer>
      </div>
    </div>
  );
};

export default AssetGridContent;
