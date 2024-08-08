/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { AssetOrDivider, DIVIDER_HEIGHT } from "./assetGridUtils";
import AssetItem from "./AssetItem";
import { colorForType } from "../../config/data_types";

interface AssetGridRowProps {
  index: number;
  style: React.CSSProperties;
  data: {
    getItemsForRow: (index: number) => AssetOrDivider[];
    gridDimensions: { itemWidth: number; itemHeight: number; columns: number };
    footerHeight: number;
    itemSpacing: number;
    selectedAssetIds: string[];
    openDeleteDialog: () => void;
    openRenameDialog: () => void;
    handleSelectAsset: (id: string) => void;
    refetch: () => void;
    setSelectedAssetIds: (ids: string[]) => void;
    onDragStart: (id: string) => string[];
  };
}

const AssetGridRow: React.FC<AssetGridRowProps> = ({ index, style, data }) => {
  const {
    getItemsForRow,
    gridDimensions,
    footerHeight,
    itemSpacing,
    selectedAssetIds,
    handleSelectAsset,
  } = data;

  const rowItems = getItemsForRow(index);

  if (rowItems.length === 0) {
    return null;
  }

  const isDividerRow = rowItems[0]?.isDivider;

  if (isDividerRow) {
    const divider = rowItems[0] as { isDivider: true; type: string };
    return (
      <div
        style={{
          ...style,
          height: DIVIDER_HEIGHT,
          padding: `${itemSpacing}px ${itemSpacing}px`,
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
        }}
        className="content-type-header"
      >
        <div
          className="divider"
          style={{
            width: "100%",
            height: "2px",
            backgroundColor: colorForType(divider.type),
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        ...style,
        display: "flex",
        flexWrap: "wrap",
        width: "100%",
        boxSizing: "border-box",
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
            key={`asset-${item.id}`}
            style={{
              width: `${gridDimensions.itemWidth}px`,
              height: `${gridDimensions.itemHeight + footerHeight}px`,
              padding: `${itemSpacing}px`,
              flexShrink: 0,
              boxSizing: "border-box",
            }}
          >
            <AssetItem
              asset={item}
              draggable={true}
              isSelected={isSelected}
              onSelect={() => handleSelectAsset(item.id)}
            />
          </div>
        );
      })}
    </div>
  );
};

export default React.memo(AssetGridRow);
