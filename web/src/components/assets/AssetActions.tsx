import React, { useCallback, memo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import SelectAllIcon from "@mui/icons-material/SelectAll";
import SortIcon from "@mui/icons-material/Sort";
import StraightenIcon from "@mui/icons-material/Straighten";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import ViewListIcon from "@mui/icons-material/ViewList";
import GridViewIcon from "@mui/icons-material/GridView";
import PhotoSizeSelectSmallIcon from "@mui/icons-material/PhotoSizeSelectSmall";

import useAssets from "../../serverState/useAssets";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import {
  ContextMenu,
  EditorButton,
  FlexRow,
  LoadingSpinner,
  MenuItemPrimitive,
  Slider,
  Tooltip,
  ViewModeToggle,
  SPACING
} from "../ui_primitives";
import { SIZE_FILTERS, SizeFilterKey } from "../../utils/formatUtils";

type AssetsOrder = "name" | "date" | "size";

const SORT_OPTIONS: { key: AssetsOrder; label: string; short: string }[] = [
  { key: "date", label: "Newest first", short: "Newest" },
  { key: "name", label: "Name (A to Z)", short: "Name" },
  { key: "size", label: "Largest first", short: "Largest" }
];

const SIZE_LABELS: Record<SizeFilterKey, string> = {
  all: "Any size",
  empty: "Empty files",
  small: "Under 1 MB",
  medium: "1 to 10 MB",
  large: "10 to 100 MB",
  xlarge: "Over 100 MB"
};

const VIEW_OPTIONS = [
  { value: "grid", icon: <GridViewIcon />, tooltip: "Grid view" },
  { value: "list", icon: <ViewListIcon />, tooltip: "List view" }
];

interface AssetActionsProps {
  handleSelectAllAssets: () => void;
  maxItemSize?: number;
}

/**
 * View options for the asset browser: sort order, file size filter, grid or
 * list, thumbnail size and select all. Each control says what it sets.
 */
const AssetActions = ({
  handleSelectAllAssets,
  maxItemSize = 10
}: AssetActionsProps) => {
  const { isLoading } = useAssets();
  const [settings, setAssetItemSize, setAssetsOrder] = useSettingsStore(
    useShallow(
      (state) =>
        [state.settings, state.setAssetItemSize, state.setAssetsOrder] as const
    )
  );
  const [sizeFilter, setSizeFilter] = useAssetGridStore(
    useShallow((state) => [state.sizeFilter, state.setSizeFilter] as const)
  );
  const [viewMode, setViewMode] = useAssetGridStore(
    useShallow((state) => [state.viewMode, state.setViewMode] as const)
  );
  const [sortAnchor, setSortAnchor] = useState<HTMLElement | null>(null);
  const [sizeAnchor, setSizeAnchor] = useState<HTMLElement | null>(null);

  const sortLabel =
    SORT_OPTIONS.find((option) => option.key === settings.assetsOrder)
      ?.short ?? "Name";

  const handleItemSize = useCallback(
    (_event: Event, value: number | number[]) => {
      setAssetItemSize(Array.isArray(value) ? value[0] : value);
    },
    [setAssetItemSize]
  );

  const handleViewMode = useCallback(
    (mode: string) => setViewMode(mode === "list" ? "list" : "grid"),
    [setViewMode]
  );

  return (
    <FlexRow
      className="asset-actions"
      align="center"
      gap={SPACING.sm}
      wrap
      sx={{ flexGrow: 1, minWidth: 0 }}
    >
      <EditorButton
        variant="text"
        color="inherit"
        density="compact"
        startIcon={<SortIcon />}
        endIcon={<ArrowDropDownIcon />}
        tooltip="Sort files"
        aria-haspopup="menu"
        onClick={(e) => setSortAnchor(e.currentTarget)}
      >
        {`Sort: ${sortLabel}`}
      </EditorButton>
      <EditorButton
        variant="text"
        color={sizeFilter === "all" ? "inherit" : "primary"}
        density="compact"
        startIcon={<StraightenIcon />}
        endIcon={<ArrowDropDownIcon />}
        tooltip="Filter by file size"
        aria-haspopup="menu"
        onClick={(e) => setSizeAnchor(e.currentTarget)}
      >
        {SIZE_LABELS[sizeFilter]}
      </EditorButton>

      <ViewModeToggle
        value={viewMode}
        onChange={handleViewMode}
        options={VIEW_OPTIONS}
        nodrag={false}
        aria-label="View"
      />

      {viewMode === "grid" && (
        <Tooltip title="Thumbnail size" placement="bottom">
          <FlexRow
            align="center"
            gap={SPACING.sm}
            sx={{ width: 140, flexShrink: 0, color: "text.secondary" }}
          >
            <PhotoSizeSelectSmallIcon sx={{ fontSize: 16 }} />
            <Slider
              size="small"
              aria-label="Thumbnail size"
              step={1}
              min={1}
              max={maxItemSize}
              value={settings.assetItemSize}
              onChange={handleItemSize}
            />
          </FlexRow>
        </Tooltip>
      )}

      <EditorButton
        variant="text"
        color="inherit"
        density="compact"
        startIcon={<SelectAllIcon />}
        tooltip="Select every file in view"
        onClick={handleSelectAllAssets}
      >
        Select all
      </EditorButton>

      {isLoading && <LoadingSpinner size={16} inline />}

      <ContextMenu
        open={Boolean(sortAnchor)}
        anchorEl={sortAnchor}
        onClose={() => setSortAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
      >
        {SORT_OPTIONS.map((option) => (
          <MenuItemPrimitive
            key={option.key}
            label={option.label}
            checkable="radio"
            checked={settings.assetsOrder === option.key}
            onClick={() => {
              setAssetsOrder(option.key);
              setSortAnchor(null);
            }}
          />
        ))}
      </ContextMenu>
      <ContextMenu
        open={Boolean(sizeAnchor)}
        anchorEl={sizeAnchor}
        onClose={() => setSizeAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
      >
        {SIZE_FILTERS.map((filter) => (
          <MenuItemPrimitive
            key={filter.key}
            label={SIZE_LABELS[filter.key]}
            checkable="radio"
            checked={sizeFilter === filter.key}
            onClick={() => {
              setSizeFilter(filter.key);
              setSizeAnchor(null);
            }}
          />
        ))}
      </ContextMenu>
    </FlexRow>
  );
};

AssetActions.displayName = "AssetActions";

export default memo(AssetActions);
