import React, { useCallback, useMemo } from "react";
import {
  AssetOrDivider,
  DIVIDER_HEIGHT,
  getExtraFooterSpace
} from "./assetGridUtils";
import AssetItem from "./AssetItem";
import { colorForType } from "../../config/data_types";
import { Asset } from "../../stores/ApiTypes";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Box,
  Caption,
  EYEBROW,
  FlexRow,
  MOTION,
  SPACING,
  Text,
  ICON_SIZE
} from "../ui_primitives";
import useContextMenuStore from "../../stores/ContextMenuStore";
import { useTheme } from "@mui/material/styles";
import { assetTypeLabel } from "./assetTypeLabels";
import { AssetGroupIcon } from "./assetGroupIcons";

interface AssetGridRowProps {
  index: number;
  style: React.CSSProperties;
  data: {
    getItemsForRow: (_index: number) => AssetOrDivider[];
    gridDimensions: { itemWidth: number; itemHeight: number; columns: number };
    footerHeight: number;
    itemSpacing: number;
    assetItemSize: number;
    selectedAssetIds: string[];
    handleSelectAsset: (_id: string) => void;
    onDragStart: (_id: string) => string[];
    onDoubleClick: (_asset: Asset) => void;
    collapsedGroups: ReadonlySet<string>;
    toggleGroup: (_type: string) => void;
  };
}

const AssetGridRow: React.FC<AssetGridRowProps> = ({ index, style, data }) => {
  const {
    getItemsForRow,
    gridDimensions,
    footerHeight,
    itemSpacing,
    assetItemSize,
    selectedAssetIds,
    handleSelectAsset,
    onDoubleClick,
    collapsedGroups,
    toggleGroup
  } = data;

  const theme = useTheme();
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const rowItems = getItemsForRow(index);

  // Otherwise each row scans the whole selection once per item it holds.
  const selectedAssetIdSet = useMemo(
    () => new Set(selectedAssetIds),
    [selectedAssetIds]
  );

  const selectHandlers = useMemo(() => {
    const handlers: Record<string, () => void> = {};
    for (const item of rowItems) {
      if (!item.isDivider) {
        handlers[item.id] = () => handleSelectAsset(item.id);
      }
    }
    return handlers;
  }, [rowItems, handleSelectAsset]);

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const target = event.target as HTMLElement;
    const isRowArea =
      target.classList.contains("asset-grid-row") ||
      target.classList.contains("asset-grid-row-item");

    const isDividerRow = rowItems[0]?.isDivider;
    const isInteractiveElement =
      target.closest(".asset-item") ||
      target.closest(".content-type-header") ||
      target.closest("button") ||
      target.tagName === "BUTTON";

    if (isRowArea && !isDividerRow && !isInteractiveElement) {
      openContextMenu(
        "asset-grid-context-menu",
        "",
        event.clientX,
        event.clientY
      );
    }
  }, [openContextMenu, rowItems]);

  const handleToggleExpanded = useCallback(() => {
    if (rowItems.length > 0 && rowItems[0]?.isDivider) {
      const divider = rowItems[0];
      toggleGroup(divider.type);
    }
  }, [rowItems, toggleGroup]);

  if (rowItems.length === 0) {
    return null;
  }

  const isDividerRow = rowItems[0]?.isDivider;
  const extraFooterSpace = getExtraFooterSpace(assetItemSize);

  if (isDividerRow) {
    const divider = rowItems[0];
    const isExpanded = !collapsedGroups.has(divider.type);

    return (
      <FlexRow
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label={`${assetTypeLabel(divider.type)}, ${divider.count} ${
          divider.count === 1 ? "file" : "files"
        }`}
        align="center"
        gap={SPACING.sm}
        className="content-type-header"
        onClick={handleToggleExpanded}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleToggleExpanded();
          }
        }}
        style={{
          ...style,
          height: DIVIDER_HEIGHT,
          padding: `0 ${itemSpacing}px`,
          boxSizing: "border-box"
        }}
      >
        <ExpandMoreIcon
          className="group-chevron"
          sx={{
            fontSize: ICON_SIZE.sm,
            color: theme.vars.palette.text.secondary,
            transform: isExpanded ? "none" : "rotate(-90deg)",
            transition: MOTION.transform
          }}
        />
        <AssetGroupIcon
          group={divider.type}
          sx={{ fontSize: ICON_SIZE.sm, color: colorForType(divider.type) }}
        />
        <Text
          component="span"
          sx={{ ...EYEBROW, color: theme.vars.palette.text.secondary, whiteSpace: "nowrap" }}
        >
          {assetTypeLabel(divider.type)}
        </Text>
        <Caption component="span" color="muted">
          {divider.count}
        </Caption>
        <Box
          className="divider"
          sx={{ flex: 1, height: "1px", backgroundColor: theme.vars.palette.divider }}
        />
      </FlexRow>
    );
  }

  const result = (
    <div
      className="asset-grid-row"
      onContextMenu={handleContextMenu}
      style={{
        ...style,
        display: "flex",
        flexWrap: "wrap",
        width: "100%",
        boxSizing: "border-box"
      }}
    >
      {rowItems.map((item) => {
        if (item.isDivider) {
          return null;
        }

        const isSelected = selectedAssetIdSet.has(item.id);

        return (
          <div
            className="asset-grid-row-item"
            key={`asset-${item.id}`}
            style={{
              width: `${gridDimensions.itemWidth}px`,
              height: `${
                gridDimensions.itemHeight + footerHeight + extraFooterSpace
              }px`,
              padding: `${itemSpacing}px`,
              flexShrink: 0,
              boxSizing: "border-box"
            }}
          >
            <AssetItem
              asset={item}
              draggable={true}
              isSelected={isSelected}
              onSelect={selectHandlers[item.id]}
              onDoubleClick={onDoubleClick}
            />
          </div>
        );
      })}
    </div>
  );

  return result;
};

export default React.memo(AssetGridRow);
