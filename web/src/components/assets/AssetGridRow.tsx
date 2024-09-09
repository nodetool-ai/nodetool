import React from "react";
import { AssetOrDivider, DIVIDER_HEIGHT } from "./assetGridUtils";
import AssetItem from "./AssetItem";
import { colorForType, iconForType } from "../../config/data_types";
import { Asset } from "../../stores/ApiTypes";
import { ExpandLess, ExpandMore } from "@mui/icons-material";
import { IconButton, Typography } from "@mui/material";
import ThemeNodetool from "../themes/ThemeNodetool";

interface AssetGridRowProps {
  index: number;
  style: React.CSSProperties;
  data: {
    getItemsForRow: (index: number) => AssetOrDivider[];
    gridDimensions: { itemWidth: number; itemHeight: number; columns: number };
    footerHeight: number;
    itemSpacing: number;
    selectedAssetIds: string[];
    handleSelectAsset: (id: string) => void;
    setSelectedAssetIds: (ids: string[]) => void;
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
    selectedAssetIds,
    handleSelectAsset,
    onDoubleClick,
    expandedTypes,
    toggleExpanded
  } = data;

  const rowItems = getItemsForRow(index);

  if (rowItems.length === 0) {
    return null;
  }

  const isDividerRow = rowItems[0]?.isDivider;

  if (isDividerRow) {
    const divider = rowItems[0] as {
      isDivider: true;
      type: string;
      count: number;
    };
    const isExpanded = expandedTypes.has(divider.type);
    return (
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
        onClick={() => toggleExpanded(divider.type)}
      >
        <Typography
          variant="body2"
          style={{
            display: "inline-block",
            margin: "0 1em 0 .5em",
            color: ThemeNodetool.palette.c_gray5,
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
          {iconForType(
            divider.type,
            {
              fill: colorForType(divider.type),
              containerStyle: {
                borderRadius: "0 0 3px 0",
                marginLeft: "0.1em",
                marginTop: "0"
              },
              bgStyle: {
                backgroundColor: "transparent",
                width: "15px"
              }
            },
            false
          )}
        </span>

        <IconButton size="small">
          {isExpanded ? <ExpandLess /> : <ExpandMore />}
        </IconButton>
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
            key={`asset-${item.id}`}
            style={{
              width: `${gridDimensions.itemWidth}px`,
              height: `${gridDimensions.itemHeight + footerHeight}px`,
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
};

export default React.memo(AssetGridRow);
