/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, {
  useEffect,
  useCallback,
  useMemo,
  useState,
  useRef
} from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import {
  VariableSizeList as List,
  ListOnItemsRenderedProps
} from "react-window";

import { useSettingsStore } from "../../stores/SettingsStore";
import useSessionStateStore from "../../stores/SessionStateStore";
import useAssets from "../../serverState/useAssets";
import { Asset } from "../../stores/ApiTypes";
import AssetItem from "./AssetItem";
import { colorForType } from "../../config/data_types";

const styles = (theme: any) =>
  css({
    "&": {
      position: "relative",
      height: "100%",
      overflow: "hidden",
      paddingBottom: ".5em"
    },
    ".autosizer-list": {
      paddingBottom: "10em"
    },
    ".content-type-header": {
      width: "100%",
      padding: "0.5em 0",
      backgroundColor: "transparent",
      fontSize: theme.fontSizeSmall,
      textTransform: "uppercase"
    },
    ".divider": {
      width: "100%",
      height: "2px",
      backgroundColor: theme.palette.divider
    }
  });

type AssetOrDivider =
  | { isDivider: true; type: string }
  | (Asset & { isDivider: false; type: string });

interface AssetGridContentProps {
  selectedAssetIds: string[];
  handleSelectAsset: (assetId: string) => void;
  setCurrentFolderId: (folderId: string) => void;
  setSelectedAssetIds: (assetIds: string[]) => void;
  openDeleteDialog: () => void;
  openRenameDialog: () => void;
  setCurrentAudioAsset: (asset: Asset) => void;
  itemSpacing?: number;
  searchTerm?: string;
}

const AssetGridContent: React.FC<AssetGridContentProps> = ({
  selectedAssetIds,
  handleSelectAsset,
  setCurrentFolderId,
  setSelectedAssetIds,
  openDeleteDialog,
  openRenameDialog,
  setCurrentAudioAsset,
  itemSpacing = 2,
  searchTerm = ""
}) => {
  const assetItemSize = useSettingsStore(
    (state) => state.settings.assetItemSize
  );
  const assetsOrder = useSettingsStore((state) => state.settings.assetsOrder);
  const filteredAssets = useSessionStateStore((state) => state.filteredAssets);
  const setFilteredAssets = useSessionStateStore(
    (state) => state.setFilteredAssets
  );

  const { sortedAssetsByType, refetch } = useAssets();

  const [containerWidth, setContainerWidth] = useState(0);
  const [gridDimensions, setGridDimensions] = useState({
    columnCount: 1,
    itemWidth: 0,
    itemHeight: 0
  });

  const listRef = useRef<List>(null);

  const getFooterHeight = useCallback((size: number) => {
    switch (size) {
      case 1:
        return 5;
      case 2:
        return 40;
      case 3:
        return 40;
      case 4:
      case 5:
        return 30;
      default:
        return 10;
    }
  }, []);

  const footerHeight = useMemo(
    () => getFooterHeight(assetItemSize),
    [assetItemSize, getFooterHeight]
  );

  const calculateGridDimensions = useCallback(
    (width: number) => {
      const baseSize = 42; // Base size factor
      const targetItemSize = baseSize * assetItemSize;
      const columnCount = Math.max(1, Math.floor(width / targetItemSize));
      const itemWidth = Math.floor(width / columnCount) - itemSpacing * 2;
      const itemHeight = itemWidth; // 1:1 aspect ratio

      setGridDimensions({ columnCount, itemWidth, itemHeight });
    },
    [assetItemSize, itemSpacing]
  );

  useEffect(() => {
    calculateGridDimensions(containerWidth);
  }, [containerWidth, assetItemSize, calculateGridDimensions]);

  useEffect(() => {
    const filterAndSortAssets = (
      assets: Asset[],
      sortByDate: boolean = false
    ) => {
      const seenIds = new Set();
      const filtered = assets.filter(
        (asset) =>
          (asset.content_type === "folder" ||
            asset.name.toLowerCase().includes(searchTerm.toLowerCase())) &&
          !seenIds.has(asset.id) &&
          seenIds.add(asset.id)
      );
      if (sortByDate && filtered[0]?.created_at) {
        filtered.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      } else {
        filtered.sort((a, b) => a.name.localeCompare(b.name));
      }
      return filtered;
    };

    const newFilteredAssets = {
      assetsByType: Object.fromEntries(
        Object.entries(sortedAssetsByType.assetsByType).map(
          ([type, assets]) => [
            type,
            filterAndSortAssets(assets, assetsOrder === "date")
          ]
        )
      ),
      totalCount: Object.values(sortedAssetsByType.assetsByType).reduce(
        (acc, assets) => acc + filterAndSortAssets(assets).length,
        0
      )
    };

    setFilteredAssets(newFilteredAssets);
  }, [sortedAssetsByType, searchTerm, setFilteredAssets, assetsOrder]);

  const flatListWithDividers = useMemo(() => {
    const flatList: AssetOrDivider[] = [];
    const seenIds = new Set();

    for (const [type, assets] of Object.entries(filteredAssets.assetsByType)) {
      if (assets.length > 0) {
        flatList.push({ type, isDivider: true });
        for (const asset of assets) {
          if (!seenIds.has(asset.id)) {
            flatList.push({ ...asset, isDivider: false, type });
            seenIds.add(asset.id);
          }
        }
      }
    }

    return flatList;
  }, [filteredAssets]);

  const preparedRows = useMemo(() => {
    const rows: AssetOrDivider[][] = [];
    let currentRow: AssetOrDivider[] = [];

    flatListWithDividers.forEach((item) => {
      if (item.isDivider) {
        if (currentRow.length > 0) {
          rows.push(currentRow);
          currentRow = [];
        }
        rows.push([item]);
      } else {
        currentRow.push(item);
        if (currentRow.length === gridDimensions.columnCount) {
          rows.push(currentRow);
          currentRow = [];
        }
      }
    });

    if (currentRow.length > 0) {
      rows.push(currentRow);
    }

    return rows;
  }, [flatListWithDividers, gridDimensions.columnCount]);

  const getRowHeight = useCallback(
    (index: number) => {
      const row = preparedRows[index];
      if (row[0]?.isDivider) return 10; // Divider height
      return gridDimensions.itemHeight + footerHeight + itemSpacing * 2; // Item height + footer + vertical spacing
    },
    [preparedRows, gridDimensions.itemHeight, footerHeight, itemSpacing]
  );

  const onDragStart = useCallback(
    (assetId: string): string[] => {
      const updatedSelectedIds = [...selectedAssetIds, assetId];
      return updatedSelectedIds;
    },
    [selectedAssetIds]
  );

  const Row = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      const rowItems = preparedRows[index];
      const isDividerRow = rowItems[0]?.isDivider;

      if (isDividerRow) {
        const divider = rowItems[0] as { isDivider: true; type: string };
        return (
          <div
            key={`divider-${index}`}
            style={{
              ...style,
              height: `10px`,
              padding: `${itemSpacing}px ${itemSpacing}px 0`,
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center"
            }}
            className="content-type-header"
          >
            <div
              className="divider"
              style={{
                width: "100%",
                height: "2px",
                backgroundColor: colorForType(divider.type)
              }}
            ></div>
          </div>
        );
      }

      return (
        <div
          style={{ ...style, display: "flex", justifyContent: "flex-start" }}
        >
          {rowItems.map((item, colIndex) => {
            if (item.isDivider) return null;
            return (
              <div
                key={`asset-${item.id}`}
                style={{
                  width: `${gridDimensions.itemWidth}px`,
                  height: `${gridDimensions.itemHeight + footerHeight}px`,
                  margin: `${itemSpacing}px`,
                  flexShrink: 0
                }}
              >
                <AssetItem
                  asset={item}
                  draggable={true}
                  isSelected={selectedAssetIds.includes(item.id)}
                  openDeleteDialog={openDeleteDialog}
                  openRenameDialog={openRenameDialog}
                  onSelect={() => handleSelectAsset(item.id)}
                  onSetCurrentAudioAsset={() => setCurrentAudioAsset(item)}
                  onMoveToFolder={() => {
                    refetch();
                    setSelectedAssetIds([]);
                  }}
                  onDeleteAssets={() => {
                    refetch();
                    setSelectedAssetIds([]);
                  }}
                  onDoubleClickFolder={(folderId) => {
                    setCurrentFolderId(folderId);
                    setSelectedAssetIds([]);
                  }}
                  onDragStart={() => onDragStart(item.id)}
                />
              </div>
            );
          })}
        </div>
      );
    },
    [
      preparedRows,
      gridDimensions,
      footerHeight,
      itemSpacing,
      selectedAssetIds,
      openDeleteDialog,
      openRenameDialog,
      handleSelectAsset,
      setCurrentAudioAsset,
      refetch,
      setSelectedAssetIds,
      setCurrentFolderId,
      onDragStart
    ]
  );

  const handleItemsRendered = useCallback(
    ({ visibleStartIndex, visibleStopIndex }: ListOnItemsRenderedProps) => {
      // This function is called when items are rendered. You can use it to implement infinite scrolling if needed.
    },
    []
  );

  useEffect(() => {
    if (listRef.current) {
      listRef.current.resetAfterIndex(0, true);
    }
  }, [gridDimensions, assetItemSize]);

  return (
    <div className="asset-grid-content" css={styles}>
      <AutoSizer>
        {({ height, width }) => {
          if (Math.abs(width - containerWidth) > 1) {
            // Add a small threshold
            setContainerWidth(width);
          }
          return (
            <List
              ref={listRef}
              className="autosizer-list"
              height={height}
              itemCount={preparedRows.length}
              itemSize={getRowHeight}
              width={width}
              onItemsRendered={handleItemsRendered}
            >
              {Row}
            </List>
          );
        }}
      </AutoSizer>
    </div>
  );
};

export default AssetGridContent;
