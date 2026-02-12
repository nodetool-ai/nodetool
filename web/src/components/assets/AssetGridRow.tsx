import React, { useCallback, useMemo } from "react";
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

  // Memoize styles to prevent re-renders
  const dividerHeaderStyle = useMemo(() => ({
    padding: `${itemSpacing}px ${itemSpacing}px`,
    boxSizing: "border-box" as const,
    display: "flex" as const,
    alignItems: "center" as const,
    cursor: "pointer" as const
  }), [itemSpacing]);

  const dividerTypographyStyle = useMemo(() => ({
    display: "inline-block" as const,
    margin: "0 1em 0 .5em",
    color: theme.vars.palette.grey[200],
    flexGrow: 1
  }), [theme]);

  const dividerLineStyle = useMemo(() => ({
    width: "100%",
    height: "2px",
    backgroundColor: "" as string
  }), []);

  const iconContainerStyle = useMemo(() => ({
    borderRadius: "0 0 3px 0" as const,
    marginLeft: "0.1em",
    marginTop: "0"
  }), []);

  const iconBgStyle = useMemo(() => ({
    backgroundColor: "transparent" as const,
    width: "15px"
  }), []);

  const gridRowStyle = useMemo(() => ({
    display: "flex" as const,
    flexWrap: "wrap" as const,
    width: "100%",
    boxSizing: "border-box" as const
  }), []);

  const gridItemStyle = useMemo(() => ({
    flexShrink: 0,
    boxSizing: "border-box" as const
  }), []);

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

  // Memoize grid row style before early return
  const gridRowStyleWithProps = useMemo(() => ({
    ...style,
    ...gridRowStyle
  }), [style, gridRowStyle]);

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
    const currentDividerLineStyle = { ...dividerLineStyle, backgroundColor: colorForType(divider.type) };

    return (
      <Tooltip
        title={`${isExpanded ? "Collapse" : "Expand"} ${divider.type} files`}
        placement="bottom"
        enterDelay={TOOLTIP_ENTER_DELAY * 2}
        enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY * 2}
      >
        <div
          style={{ ...style, height: DIVIDER_HEIGHT, ...dividerHeaderStyle }}
          className="content-type-header"
          onClick={handleToggleExpanded}
        >
          <Typography
            variant="body2"
            style={dividerTypographyStyle}
          >
            {divider.count}
          </Typography>
          <div
            className="divider"
            style={currentDividerLineStyle}
          />
          <span style={{ marginLeft: "8px" }}>
            <IconForType
              iconName={divider.type}
              containerStyle={iconContainerStyle}
              bgStyle={iconBgStyle}
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
      style={gridRowStyleWithProps}
    >
      {rowItems.map((item) => {
        if (item.isDivider) {
          return null;
        }

        const isSelected =
          selectedAssetIds && selectedAssetIds.includes(item.id);

        const itemHeight = gridDimensions.itemHeight + footerHeight + extraFooterSpace;

        return (
          <div
            className="asset-grid-row-item"
            key={`asset-${item.id}`}
            style={{
              ...gridItemStyle,
              width: `${gridDimensions.itemWidth}px`,
              height: `${itemHeight}px`,
              padding: `${itemSpacing}px`
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
