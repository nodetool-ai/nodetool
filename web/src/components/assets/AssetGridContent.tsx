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
  calculateGridDimensions,
  prepareItems,
  calculateRowCount,
  getItemsForRow,
  isAssetItem,
  DIVIDER_HEIGHT
} from "./assetGridUtils";
import { useAssetSelection } from "../../hooks/assets/useAssetSelection";
import useContextMenuStore from "../../stores/ContextMenuStore";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import AssetListView from "./AssetListView";
import { assetTypeLabel } from "./assetTypeLabels";
import {
  BORDER_RADIUS,
  EmptyState,
  LoadingSpinner,
  MOTION,
  getSpacingPx,
  SPACING,
  focusRing
} from "../ui_primitives";

const styles = (theme: Theme) =>
  css({
    "&": {
      position: "relative",
      flex: 1,
      height: "100%",
      minHeight: 0,
      overflow: "hidden",
      paddingBottom: getSpacingPx(SPACING.md),
      display: "flex",
      flexDirection: "column"
    },
    ".asset-list": {
      flex: 1,
      minHeight: 0,
      marginTop: getSpacingPx(SPACING.sm),
      overflow: "auto"
    },
    ".autosizer-list": {
      paddingBottom: "14em"
    },
    ".content-type-header": {
      width: "100%",
      cursor: "pointer",
      userSelect: "none",
      borderRadius: BORDER_RADIUS.md,
      transition: MOTION.background,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      },
      "&:focus-visible": focusRing(theme)
    },
  });

// Constant, so `memo(AssetGridRow)` actually hits — a literal at the call site
// gave every visible row a new `style` object on every render.
const ROW_STYLE: React.CSSProperties = { width: "100%", height: "100%" };

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
  const { folderFilesFiltered, isLoading, error, refetchAssets } = useAssets();
  const assetItemSize = useSettingsStore(
    (state) => state.settings.assetItemSize
  );
  const workflowFilter = useAssetGridStore((state) => state.workflowFilter);
  const favoritesOnly = useAssetGridStore((state) => state.favoritesOnly);

  // Base asset list (without dividers)
  const assets = useMemo(() => {
    if (propAssets) {return propAssets;}
    return folderFilesFiltered || [];
  }, [propAssets, folderFilesFiltered]);

  // Collapsed type groups are remembered per surface, so a group the user
  // folded away stays folded in the next folder and after a reload.
  const collapsedAssetGroups = useAssetGridStore(
    (state) => state.collapsedAssetGroups
  );
  const toggleAssetGroupCollapsed = useAssetGridStore(
    (state) => state.toggleAssetGroupCollapsed
  );
  const typeFilter = useAssetGridStore((state) => state.typeFilter);
  const setTypeFilter = useAssetGridStore((state) => state.setTypeFilter);
  const collapsedGroups = useMemo(
    () => new Set(collapsedAssetGroups),
    [collapsedAssetGroups]
  );

  // With one type filtered in, a single group header adds nothing (and
  // collapsing it would hide every asset), so the grid drops the headers.
  const preparedItems = useMemo(() => {
    return prepareItems(assets || [], collapsedGroups, typeFilter === "all");
  }, [assets, collapsedGroups, typeFilter]);

  // Extract visual order of assets excluding dividers – this is the order that
  // users actually see and therefore the order that shift-range selection must
  // follow.
  const visualOrderAssets = useMemo(() => {
    return preparedItems.filter(isAssetItem);
  }, [preparedItems]);

  // Use the *visual* order for the selection algorithm so shift-click works
  // intuitively.  Ctrl-click behaviour is also more predictable because the
  // hook's internal maps match what the user sees.
  const { selectedAssetIds, handleSelectAsset } =
    useAssetSelection(visualOrderAssets);
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const viewMode = useAssetGridStore((state) => state.viewMode);

  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  const [gridDimensions, setGridDimensions] = useState({
    columns: 1,
    itemWidth: 0,
    itemHeight: 0
  });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);

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
      return gridDimensions.itemHeight + itemSpacing * 2;
    },
    [preparedItems, gridDimensions, itemSpacing]
  );

  // Separate stable data from selection state to prevent unnecessary re-renders
  const stableItemData = useMemo(() => {
    return {
      getItemsForRow: (index: number) =>
        getItemsForRow(preparedItems, index, gridDimensions.columns),
      gridDimensions,
      itemSpacing,
      handleSelectAsset,
      onDragStart,
      onDoubleClick: onDoubleClick || (() => {}),
      collapsedGroups,
      toggleGroup: toggleAssetGroupCollapsed
    };
  }, [
    preparedItems,
    gridDimensions,
    itemSpacing,
    handleSelectAsset,
    onDragStart,
    onDoubleClick,
    collapsedGroups,
    toggleAssetGroupCollapsed
    // Note: selectedAssetIds is NOT included here!
  ]);

  const selectionData = useMemo(
    () => ({ selectedAssetIds }),
    [selectedAssetIds]
  );

  const itemData = useMemo(
    () => ({ ...stableItemData, ...selectionData }),
    [stableItemData, selectionData]
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

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => listScrollRef.current,
    estimateSize: getRowHeight,
    overscan: theme.virtualScroll.overscan.gridRow,
  });

  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;

  useEffect(() => {
    virtualizerRef.current.measure();
  }, [gridDimensions, assetItemSize, preparedItems]);

  // If list view is selected, render AssetListView instead
  if (viewMode === "list") {
    return (
      <div
        className="asset-grid-content"
        css={cssStyles}
        ref={containerRef}
        onContextMenu={handleContextMenu}
        style={{
          width: "100%",
          height: "100%",
          borderLeft: isHorizontal
            ? `1px solid ${theme.vars.palette.divider}`
            : "none",
          paddingLeft: isHorizontal ? getSpacingPx(SPACING.md) : "0"
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

  // Default grid view. While the folder is loading (or failed to load), show
  // that instead of a misleading "empty folder" message.
  if (assets.length === 0) {
    return (
      <div
        className="asset-grid-content"
        css={cssStyles}
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
        {isLoading ? (
          <LoadingSpinner size="small" text="Loading assets" />
        ) : error ? (
          <EmptyState
            variant="error"
            title="Could not load assets"
            description={error.message || "An error occurred. Please try again."}
            actionText="Retry"
            onAction={refetchAssets}
            size="small"
          />
        ) : typeFilter !== "all" ? (
          <EmptyState
            variant="no-results"
            title={`No ${assetTypeLabel(typeFilter).toLowerCase()} here`}
            description="Other file types are hidden by the type filter."
            actionText="Show all types"
            onAction={() => setTypeFilter("all")}
            size="small"
          />
        ) : (
          <EmptyState
            variant="no-data"
            title={
              favoritesOnly
                ? "No favorites yet"
                : workflowFilter
                  ? "No outputs from this workflow yet"
                  : "This folder is empty"
            }
            description={
              favoritesOnly
                ? "Star an asset to find it here from any folder."
                : workflowFilter
                  ? "Run the workflow to generate assets, or drop files here to add inputs."
                  : "Drop files here or use the upload button to add assets"
            }
            size="small"
          />
        )}
      </div>
    );
  }

  return (
    <div
      className="asset-grid-content"
      css={cssStyles}
      ref={containerRef}
      onContextMenu={handleContextMenu}
      style={{
        width: "100%",
        height: "100%",
        borderLeft: isHorizontal
          ? `1px solid ${theme.vars.palette.divider}`
          : "none",
        paddingLeft: isHorizontal ? getSpacingPx(SPACING.md) : "0"
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
                style={ROW_STYLE}
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
