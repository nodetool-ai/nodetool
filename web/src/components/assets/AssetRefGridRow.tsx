/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { AssetRef } from "../../stores/ApiTypes";
import { AssetRefOrDivider } from "./assetRefGridUtils";

interface AssetRefGridRowProps {
  index: number;
  style: React.CSSProperties;
  data: {
    getItemsForRow: (index: number) => AssetRefOrDivider[];
    gridDimensions: {
      columns: number;
      itemWidth: number;
      itemHeight: number;
    };
    footerHeight: number;
    itemSpacing: number;
    selectedAssetIds: string[];
    handleSelectAsset: (assetId: string, multiSelect: boolean) => void;
    setSelectedAssetIds: (ids: string[]) => void;
    onDragStart: (assetId: string) => string[];
    onDoubleClick: (assetRef: AssetRef) => void;
    expandedTypes: Set<string>;
    toggleExpanded: (type: string) => void;
  };
}

const styles = (theme: any) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      padding: "0.5em 0"
    },
    ".divider": {
      width: "100%",
      height: "2px",
      backgroundColor: theme.palette.divider,
      margin: "0.5em 0"
    },
    ".content-type-header": {
      width: "100%",
      padding: "0.5em 0",
      backgroundColor: "transparent",
      fontSize: theme.fontSizeSmall,
      textTransform: "uppercase",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    },
    ".content-type-header button": {
      opacity: 0.6
    },
    ".content-type-header:hover button": {
      opacity: 1
    }
  });

const AssetRefGridRow: React.FC<AssetRefGridRowProps> = ({
  index,
  style,
  data
}) => {
  const {
    getItemsForRow,
    gridDimensions,
    footerHeight,
    itemSpacing,
    selectedAssetIds,
    handleSelectAsset,
    setSelectedAssetIds,
    onDragStart,
    onDoubleClick,
    expandedTypes,
    toggleExpanded
  } = data;

  const items = getItemsForRow(index);

  if (items.length === 0) {
    return null;
  }

  if (items[0].isDivider) {
    const { type, count } = items[0];
    return (
      <div css={styles} style={style}>
        <div className="content-type-header">
          <span>
            {type} ({count})
          </span>
          <button onClick={() => toggleExpanded(type)}>
            {expandedTypes.has(type) ? "▼" : "▶"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div css={styles} style={style}>
      {items.map((item, i) => {
        if (item.isDivider) return null;
        const assetRef = item;
        return (
          <div
            key={assetRef.uri}
            style={{
              width: gridDimensions.itemWidth,
              height: gridDimensions.itemHeight + footerHeight,
              marginRight: itemSpacing,
              position: "relative"
            }}
            onDoubleClick={() => onDoubleClick(assetRef)}
            draggable
            onDragStart={(e) => {
              const selectedIds = onDragStart(assetRef.uri);
              e.dataTransfer.setData("text/plain", JSON.stringify(selectedIds));
            }}
            onClick={(e) => {
              handleSelectAsset(assetRef.uri, e.ctrlKey || e.metaKey);
            }}
          >
            <div
              style={{
                width: "100%",
                height: gridDimensions.itemHeight,
                backgroundColor: selectedAssetIds.includes(assetRef.uri)
                  ? "rgba(0, 0, 0, 0.1)"
                  : "transparent",
                border: selectedAssetIds.includes(assetRef.uri)
                  ? "2px solid #007AFF"
                  : "2px solid transparent",
                borderRadius: "4px",
                overflow: "hidden"
              }}
            >
              {/* Here you would render the appropriate preview based on the asset type */}
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#f5f5f5"
                }}
              >
                {assetRef.type}
              </div>
            </div>
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: footerHeight,
                padding: "4px",
                fontSize: "12px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {assetRef.uri.split("/").pop()}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AssetRefGridRow;
