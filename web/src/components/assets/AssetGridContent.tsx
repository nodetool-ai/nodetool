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
import useSessionStateStore from "../../stores/SessionStateStore";
import useAssets from "../../serverState/useAssets";
import { Asset } from "../../stores/ApiTypes";
import AssetGridRow from "./AssetGridRow";
import {
  getFooterHeight,
  calculateGridDimensions,
  prepareItems,
  calculateRowCount,
  getItemsForRow,
  DIVIDER_HEIGHT
} from "./assetGridUtils";
import { useAssetSelection } from "../../hooks/assets/useAssetSelection";
import { useAssetStore } from "../../hooks/AssetStore";
import { useAssetDialog } from "../../hooks/assets/useAssetDialog";

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

interface AssetGridContentProps {
  itemSpacing?: number;
  searchTerm?: string;
  assets?: Asset[];
  onlyUseProvidedAssets?: boolean;
}

const AssetGridContent: React.FC<AssetGridContentProps> = ({
  itemSpacing = 2,
  searchTerm = "",
  assets = [],
  onlyUseProvidedAssets = false
}) => {
  const { sortedAssets } = useAssets();
  const { selectedAssetIds, setSelectedAssetIds, handleSelectAsset } =
    useAssetSelection(sortedAssets);
  const setCurrentFolderId = useAssetStore((state) => state.setCurrentFolderId);

  const assetItemSize = useSettingsStore(
    (state) => state.settings.assetItemSize
  );
  const { sortedAssetsByType, refetch } = useAssets();
  const assetsOrder = useSettingsStore((state) => state.settings.assetsOrder);
  // const filteredAssets = assets;
  const { openDeleteDialog, openRenameDialog } = useAssetDialog();
  const setFilteredAssets = useSessionStateStore(
    (state) => state.setFilteredAssets
  );

  const finalAssetsByType = useMemo(() => {
    if (onlyUseProvidedAssets || assets.length > 1) {
      const assetsByType = assets.reduce((acc, asset) => {
        const type = asset.content_type || "other";
        if (!acc[type]) {
          acc[type] = [];
        }
        acc[type].push(asset);
        return acc;
      }, {} as Record<string, Asset[]>);

      return {
        assetsByType,
        totalCount: assets.length
      };
    }

    return sortedAssetsByType;
  }, [assets, sortedAssetsByType, onlyUseProvidedAssets]);

  const preparedItems = useMemo(() => {
    if (!finalAssetsByType || !finalAssetsByType.assetsByType) {
      return [];
    }
    return prepareItems(finalAssetsByType.assetsByType);
  }, [finalAssetsByType]);

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

  const rowCount = useMemo(() => {
    const count = calculateRowCount(preparedItems, gridDimensions.columns);
    return count;
  }, [preparedItems, gridDimensions.columns]);

  const onDragStart = useCallback(
    (assetId: string): string[] => [...selectedAssetIds, assetId],
    [selectedAssetIds]
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
      const height = gridDimensions.itemHeight + footerHeight + itemSpacing * 2;
      return height;
    },
    [preparedItems, gridDimensions, footerHeight, itemSpacing]
  );

  const itemData = useMemo(
    () => ({
      getItemsForRow: (index: number) => {
        const items = getItemsForRow(
          preparedItems,
          index,
          gridDimensions.columns
        );
        return items;
      },
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
    }),
    [
      preparedItems,
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

  return (
    <div
      className="asset-grid-content"
      css={styles}
      ref={containerRef}
      style={{ width: "100%", height: "100%" }}
    >
      <AutoSizer>
        {({ height, width }: { height: number; width: number }) => {
          return (
            <>
              {sortedAssetsByType.totalCount === 0 ? (
                <div>Loading...</div>
              ) : gridDimensions.itemWidth <= 0 ||
                gridDimensions.itemHeight <= 0 ? (
                <div>Calculating dimensions...</div>
              ) : rowCount === 0 ? (
                <div>No items to display</div>
              ) : (
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
              )}
            </>
          );
        }}
      </AutoSizer>
    </div>
  );
};

export default AssetGridContent;
