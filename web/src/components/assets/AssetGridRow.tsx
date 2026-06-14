import React, { useCallback, useMemo } from "react";
import {
  AssetOrDivider,
  DIVIDER_HEIGHT,
  getExtraFooterSpace
} from "./assetGridUtils";
import AssetItem from "./AssetItem";
import { colorForType } from "../../config/data_types";
import { IconForType } from "../../config/IconForType";
import { Asset } from "../../stores/ApiTypes";
import { Text, Tooltip, BORDER_RADIUS, FONT_WEIGHT } from "../ui_primitives";
import useContextMenuStore from "../../stores/ContextMenuStore";
import { useTheme } from "@mui/material/styles";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../config/constants";
import { ExpandCollapseButton } from "../ui_primitives";

const TYPE_LABELS: Record<string, string> = {
  image: "Images",
  video: "Videos",
  audio: "Audio",
  model_3d: "3D Models",
  text: "Text",
  application: "Documents",
  folder: "Folders",
  other: "Other"
};

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
    expandedTypes: Set<string>;
    toggleExpanded: (_type: string) => void;
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
    expandedTypes,
    toggleExpanded
  } = data;

  const theme = useTheme();
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const rowItems = getItemsForRow(index);

  // Memoize select handlers for each item to prevent re-renders
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

  // Empty callback for disabled button - prevents new function creation on each render
  const emptyCallback = useCallback(() => {}, []);

  const handleToggleExpanded = useCallback(() => {
    if (rowItems.length > 0 && rowItems[0]?.isDivider) {
      const divider = rowItems[0] as {
        isDivider: true;
        type: string;
        count: number;
      };
      toggleExpanded(divider.type);
    }
  }, [rowItems, toggleExpanded]);

  if (rowItems.length === 0) {
    return null;
  }

  const isDividerRow = rowItems[0]?.isDivider;
  const extraFooterSpace = getExtraFooterSpace(assetItemSize);

  if (isDividerRow) {
    const divider = rowItems[0] as {
      isDivider: true;
      type: string;
      count: number;
    };
    const isExpanded = expandedTypes.has(divider.type);

    const typeLabel = TYPE_LABELS[divider.type] ?? divider.type;

    return (
      <Tooltip
        title={`${isExpanded ? "Collapse" : "Expand"} ${typeLabel.toLowerCase()}`}
        placement="bottom"
        delay={TOOLTIP_ENTER_DELAY * 2}
        nextDelay={TOOLTIP_ENTER_NEXT_DELAY * 2}
      >
        <div
          role="button"
          tabIndex={0}
          style={{
            ...style,
            height: DIVIDER_HEIGHT,
            padding: `${itemSpacing}px ${itemSpacing}px`,
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            gap: "8px"
          }}
          className="content-type-header"
          onClick={handleToggleExpanded}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleToggleExpanded();
            }
          }}
        >
          <Text
            size="small"
            style={{
              color: theme.vars.palette.grey[300],
              lineHeight: 1,
              whiteSpace: "nowrap"
            }}
          >
            {divider.count}
          </Text>
          <IconForType
            iconName={divider.type}
            containerStyle={{
              borderRadius: `0 0 ${BORDER_RADIUS.xs} 0`,
              marginLeft: "0",
              marginTop: "0"
            }}
            bgStyle={{
              backgroundColor: "transparent",
              width: "16px"
            }}
            showTooltip={false}
          />
          <Text
            size="small"
            weight={FONT_WEIGHT.semibold}
            style={{
              color: theme.vars.palette.grey[100],
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              lineHeight: 1,
              whiteSpace: "nowrap"
            }}
          >
            {typeLabel}
          </Text>
          <div
            className="divider"
            style={{
              flex: 1,
              height: "2px",
              backgroundColor: colorForType(divider.type)
            }}
          />
          <ExpandCollapseButton
            expanded={isExpanded}
            onClick={emptyCallback}
            size="small"
            nodrag={false}
            sx={{ pointerEvents: 'none' }}
          />
        </div>
      </Tooltip>
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

        const isSelected =
          selectedAssetIds && selectedAssetIds.includes(item.id);

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
