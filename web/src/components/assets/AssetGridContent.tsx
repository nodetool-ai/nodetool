/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, {
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useState,
  useRef
} from "react";
import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeList as List } from "react-window";

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

  const [gridDimensions, setGridDimensions] = useState({
    columns: 1,
    itemWidth: 0,
    itemHeight: 0
  });
  const [gridKey, setGridKey] = useState(0);

  const containerWidthRef = useRef<number>(0);

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
      const columns = Math.max(1, Math.floor(width / targetItemSize));
      const itemWidth = Math.floor(
        (width - itemSpacing * (columns + 1)) / columns
      );
      const itemHeight = itemWidth; // 1:1 aspect ratio

      setGridDimensions({ columns, itemWidth, itemHeight });
      setGridKey((prevKey) => prevKey + 1);
    },
    [assetItemSize, itemSpacing]
  );

  useLayoutEffect(() => {
    calculateGridDimensions(containerWidthRef.current);
  }, [calculateGridDimensions]);

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

  const preparedItems = useMemo(() => {
    const items: AssetOrDivider[] = [];
    Object.entries(filteredAssets.assetsByType).forEach(([type, assets]) => {
      if (assets.length > 0) {
        items.push({ type, isDivider: true });
        items.push(
          ...assets.map((asset) => ({ ...asset, isDivider: false, type }))
        );
      }
    });
    return items;
  }, [filteredAssets]);

  const rowCount = useMemo(() => {
    let count = 0;
    let currentRowItemCount = 0;
    preparedItems.forEach((item) => {
      if (item.isDivider) {
        if (currentRowItemCount > 0) {
          count++;
        }
        count++;
        currentRowItemCount = 0;
      } else {
        currentRowItemCount++;
        if (currentRowItemCount === gridDimensions.columns) {
          count++;
          currentRowItemCount = 0;
        }
      }
    });
    if (currentRowItemCount > 0) {
      count++;
    }
    return count;
  }, [preparedItems, gridDimensions.columns]);

  const getItemsForRow = useCallback(
    (rowIndex: number) => {
      let currentRow = 0;
      let itemsInCurrentRow = 0;
      let startIndex = 0;

      for (let i = 0; i < preparedItems.length; i++) {
        const item = preparedItems[i];
        if (item.isDivider) {
          if (itemsInCurrentRow > 0) {
            currentRow++;
            itemsInCurrentRow = 0;
          }
          if (currentRow === rowIndex) {
            return [item];
          }
          currentRow++;
          startIndex = i + 1;
        } else {
          itemsInCurrentRow++;
          if (
            itemsInCurrentRow === gridDimensions.columns ||
            i === preparedItems.length - 1
          ) {
            if (currentRow === rowIndex) {
              return preparedItems.slice(startIndex, i + 1);
            }
            currentRow++;
            itemsInCurrentRow = 0;
            startIndex = i + 1;
          }
        }
      }
      return [];
    },
    [preparedItems, gridDimensions.columns]
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
      const rowItems = getItemsForRow(index);
      const isDividerRow = rowItems[0]?.isDivider;

      if (isDividerRow) {
        const divider = rowItems[0] as { isDivider: true; type: string };
        return (
          <div
            key={`divider-${index}`}
            style={{
              ...style,
              height: "30px", // Adjusted divider height
              padding: `${itemSpacing}px ${itemSpacing}px`,
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
      getItemsForRow,
      gridDimensions,
      footerHeight,
      itemSpacing,
      selectedAssetIds,
      openDeleteDialog,
      openRenameDialog,
      handleSelectAsset,
      refetch,
      setSelectedAssetIds,
      setCurrentFolderId,
      onDragStart
    ]
  );

  return (
    <div className="asset-grid-content" css={styles}>
      <AutoSizer>
        {({ height, width }: { height: number; width: number }) => {
          if (width !== containerWidthRef.current) {
            containerWidthRef.current = width;
            // Use requestAnimationFrame to defer the state update
            requestAnimationFrame(() => calculateGridDimensions(width));
          }
          return (
            <List
              key={gridKey}
              className="autosizer-list"
              height={height}
              itemCount={rowCount}
              itemSize={
                gridDimensions.itemHeight + footerHeight + itemSpacing * 2
              }
              width={width}
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
