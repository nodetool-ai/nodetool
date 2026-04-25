/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import AssetListView from "./AssetListView";
import { EmptyState } from "../ui_primitives";

const styles = (theme: Theme) =>
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
      marginTop: "1em",
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
      backgroundColor: theme.vars.palette.divider
    }
  });

interface AssetGridContentProps {
  itemSpacing?: number;
  assets?: Asset[];
  isHorizontal?: boolean;
  onDoubleClick?: (asset: Asset) => void;
}

const AssetGridContent: React.FC<AssetGridContentProps> = memo(({
  itemSpacing = 2,
  assets: propAssets,
  isHorizontal,
  onDoubleClick
}) => {
  const { folderFilesFiltered } = useAssets();
  const assetItemSize = useSettingsStore(
    (state) => state.settings.assetItemSize
  );

  // Base asset list (without dividers)
  const assets = useMemo(() => {
    if (propAssets) {return propAssets;}
    return folderFilesFiltered || [];
  }, [propAssets, folderFilesFiltered]);

  // State for which content-types are expanded / collapsed must be defined
  // *before* we compute the prepared items that depend on it, so that the
  // hook order remains stable.
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(
    new Set(["folder", "image", "audio", "video", "model_3d", "text", "other"])
  );

  // Prepare items (adds dividers, respects expanded types)
  const preparedItems = useMemo(() => {
    return prepareItems(assets || [], expandedTypes);
  }, [assets, expandedTypes]);

  // Extract visual order of assets excluding dividers – this is the order that
  // users actually see and therefore the order that shift-range selection must
  // follow.
  const visualOrderAssets = useMemo(() => {
    return preparedItems.filter((item) => !item.isDivider) as Asset[];
  }, [preparedItems]);

  // Use the *visual* order for the selection algorithm so shift-click works
  // intuitively.  Ctrl-click behaviour is also more predictable because the
  // hook's internal maps match what the user sees.
  const { selectedAssetIds, handleSelectAsset } =
    useAssetSelection(visualOrderAssets);
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const viewMode = useAssetGridStore((state) => state.viewMode);

  const theme = useTheme();

  const [gridDimensions, setGridDimensions] = useState({
    columns: 1,
    itemWidth: 0,
    itemHeight: 0
  });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const footerHeight = useMemo(
    () => getFooterHeight(assetItemSize),
    [assetItemSize]
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

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => listScrollRef.current,
    estimateSize: getRowHeight,
    overscan: 4,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [gridDimensions, assetItemSize, preparedItems, virtualizer]);

  // If list view is selected, render AssetListView instead
  if (viewMode === "list") {
    return (
      <div
        className="asset-grid-content"
        css={styles(theme)}
        ref={containerRef}
        onContextMenu={handleContextMenu}
        style={{
          width: "100%",
          height: "100%",
          borderLeft: isHorizontal
            ? "1px solid" + theme.vars.palette.grey[600]
            : "none",
          paddingLeft: isHorizontal ? ".5em" : "0"
        }}
      >
        <AssetListView
          assets={assets}
          onDoubleClick={onDoubleClick}
          containerWidth={containerSize.width}
          isHorizontal={isHorizontal}
        />
      </div>
    );
  }

  // Default grid view
  if (assets.length === 0) {
    return (
      <div
        className="asset-grid-content"
        css={styles(theme)}
        ref={containerRef}
        onContextMenu={handleContextMenu}
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <EmptyState
          variant="no-data"
          title="This folder is empty"
          description="Drop files here or use the upload button to add assets"
          size="small"
        />
      </div>
    );
  }

  return (
    <div
      className="asset-grid-content"
      css={styles(theme)}
      ref={containerRef}
      onContextMenu={handleContextMenu}
      style={{
        width: "100%",
        height: "100%",
        borderLeft: isHorizontal
          ? "1px solid" + theme.vars.palette.grey[600]
          : "none",
        paddingLeft: isHorizontal ? ".5em" : "0"
      }}
    >
      <div
        ref={listScrollRef}
        className="asset-list autosizer-list"
        style={{ overflow: "auto" }}
      >
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((vi) => (
            <div
              key={vi.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: vi.size,
                transform: `translateY(${vi.start}px)`,
              }}
            >
              <AssetGridRow
                index={vi.index}
                style={{ width: "100%", height: "100%" }}
                data={itemData}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

AssetGridContent.displayName = 'AssetGridContent';

// Memoize component to prevent unnecessary re-renders
// AssetGridContent is used in contexts where parent updates frequently
// but the grid itself doesn't need to re-render
export default React.memo(AssetGridContent, (prevProps, nextProps) => {
  return (
    prevProps.itemSpacing === nextProps.itemSpacing &&
    prevProps.isHorizontal === nextProps.isHorizontal &&
    prevProps.assets === nextProps.assets &&
    prevProps.onDoubleClick === nextProps.onDoubleClick
  );
});
