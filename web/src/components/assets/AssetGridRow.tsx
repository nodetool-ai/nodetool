import React, { useCallback } from "react";
import {
  AssetOrDivider,
  DIVIDER_HEIGHT,
  getExtraFooterSpace
} from "./assetGridUtils";
import AssetItem from "./AssetItem";
import { colorForType, IconForType } from "../../config/data_types";
import { Asset } from "../../stores/ApiTypes";
import { Typography, Tooltip } from "@mui/material";
import useContextMenuStore from "../../stores/ContextMenuStore";
import { useTheme } from "@mui/material/styles";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../config/constants";
import { ExpandCollapseButton } from "../ui_primitives";

interface AssetGridRowProps {
  index: number;
  style: React.CSSProperties;
  data: {
    getItemsForRow: (index: number) => AssetOrDivider[];
    gridDimensions: { itemWidth: number; itemHeight: number; columns: number };
    footerHeight: number;
    itemSpacing: number;
    assetItemSize: number;
    selectedAssetIds: string[];
    handleSelectAsset: (id: string) => void;
    onDragStart: (id: string) => string[];
    onDoubleClick: (asset: Asset) => void;
    expandedTypes: Set<string>;
    toggleExpanded: (type: string) => void;
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

    return (
      <Tooltip
        title={`${isExpanded ? "Collapse" : "Expand"} ${divider.type} files`}
        placement="bottom"
        enterDelay={TOOLTIP_ENTER_DELAY * 2}
        enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY * 2}
      >
        <div
          style={{
            ...style,
            height: DIVIDER_HEIGHT,
            padding: `${itemSpacing}px ${itemSpacing}px`,
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            cursor: "pointer"
          }}
          className="content-type-header"
          onClick={handleToggleExpanded}
        >
          <Typography
            variant="body2"
            style={{
              display: "inline-block",
              margin: "0 1em 0 .5em",
              color: theme.vars.palette.grey[200],
              flexGrow: 1
            }}
          >
            {divider.count}
          </Typography>
          <div
            className="divider"
            style={{
              width: "100%",
              height: "2px",
              backgroundColor: colorForType(divider.type)
            }}
          />
          <span style={{ marginLeft: "8px" }}>
            <IconForType
              iconName={divider.type}
              containerStyle={{
                borderRadius: "0 0 3px 0",
                marginLeft: "0.1em",
                marginTop: "0"
              }}
              bgStyle={{
                backgroundColor: "transparent",
                width: "15px"
              }}
              showTooltip={false}
            />
          </span>

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
              onSelect={() => handleSelectAsset(item.id)}
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
