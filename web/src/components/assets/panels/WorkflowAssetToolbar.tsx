/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback } from "react";
import SelectAllIcon from "@mui/icons-material/SelectAll";
import DeselectIcon from "@mui/icons-material/Deselect";
import ViewListIcon from "@mui/icons-material/ViewList";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  UploadButton,
  ToolbarIconButton,
  FlexRow,
  NodeSelect,
  NodeMenuItem
} from "../../ui_primitives";
import { useAssetGridStore } from "../../../stores/AssetGridStore";
import { useSettingsStore } from "../../../stores/SettingsStore";
import { useAssetSelection } from "../../../hooks/assets/useAssetSelection";
import SliderBasic from "../../inputs/SliderBasic";
import { Asset } from "../../../stores/ApiTypes";
import AssetTypeFilter from "../AssetTypeFilter";
import { TypeFilterKey } from "../../../utils/formatUtils";
import isEqual from "fast-deep-equal";
import { shallow } from "zustand/shallow";

interface WorkflowAssetToolbarProps {
  assets: Asset[];
  onUpload: (args: { file: File; onProgress?: (progress: number) => void }) => void;
  _isUploading?: boolean;
}

const styles = (theme: Theme) =>
  css({
    ".asset-button-group svg": {
      fontSize: "18px",
      width: "18px",
      height: "18px"
    },
    ".sort-assets": {
      margin: "0 0.5em",
      "& .MuiSelect-select": {
        color: theme.vars.palette.grey[200],
        border: `1px solid ${theme.vars.palette.grey[500]}`,
        borderRadius: ".25em",
        padding: "0.25em 0.5em",
        fontSize: theme.fontSizeTiny,
        textTransform: "uppercase",
        minWidth: "80px"
      },
      "& .MuiSelect-icon": {
        display: "none"
      },
      "&:hover .MuiSelect-select": {
        border: "1px solid var(--palette-primary-main)"
      }
    },
    ".asset-size-slider": {
      flexGrow: 1,
      flexShrink: 1,
      minWidth: "80px",
      maxWidth: "150px",
      paddingLeft: "0.5em",
      "& .MuiSlider-root": {
        color: theme.vars.palette.grey[200],
        height: "20px"
      },
      "& .MuiSlider-root:hover": {
        color: "var(--palette-primary-main)"
      }
    },
    
    "@media (max-width: 520px)": {
      "&": {
        flexDirection: "column",
        alignItems: "flex-start"
      },
      ".asset-size-slider": {
        maxWidth: "100%",
        width: "100%"
      }
    }
  });

const WorkflowAssetToolbar: React.FC<WorkflowAssetToolbarProps> = ({
  assets,
  onUpload,
  _isUploading
}) => {
  const theme = useTheme();
  const { handleSelectAllAssets, handleDeselectAssets } = useAssetSelection(assets);
  const [viewMode, setViewMode] = useAssetGridStore((state) => [
    state.viewMode,
    state.setViewMode
  ] as const, shallow);
  const typeFilter = useAssetGridStore((state) => state.typeFilter);
  const setTypeFilter = useAssetGridStore((state) => state.setTypeFilter);
  const [settings, setAssetItemSize, setAssetsOrder] = useSettingsStore((state) => [
    state.settings,
    state.setAssetItemSize,
    state.setAssetsOrder
  ] as const, shallow);

  const handleTypeFilterChange = useCallback(
    (next: TypeFilterKey) => setTypeFilter(next),
    [setTypeFilter]
  );


  const handleViewModeToggle = useCallback(() => {
    setViewMode(viewMode === "grid" ? "list" : "grid");
  }, [viewMode, setViewMode]);

  const handleUpload = useCallback((files: File[]) => {
    files.forEach((file) => {
      onUpload({ file });
    });
  }, [onUpload]);

  const handleChange = useCallback((_: Event, value: number | number[]) => {
    const newValue = Array.isArray(value) ? value[0] : value;
    setAssetItemSize(newValue as number);
  }, [setAssetItemSize]);

  const handleOrderChange = useCallback((value: string) => {
    setAssetsOrder(value as "name" | "date" | "size");
  }, [setAssetsOrder]);

  return (
    <FlexRow
      css={styles(theme)}
      className="workflow-asset-toolbar"
      gap={0.5}
      padding={0.5}
      align="center"
      wrap
      fullWidth
      sx={{
        backgroundColor: theme.vars.palette.c_editor_bg_color,
        borderBottom: `1px solid ${theme.vars.palette.divider}`,
        "@media (max-width: 520px)": {
          flexDirection: "column",
          alignItems: "flex-start"
        }
      }}
    >
      <UploadButton
        onFileSelect={handleUpload}
        iconVariant="file"
        tooltip="Upload files"
        multiple
      />
      
      <FlexRow className="asset-button-group" align="center" gap={0.25}>
        <ToolbarIconButton
          icon={<SelectAllIcon />}
          tooltip="Select all"
          onClick={handleSelectAllAssets}
          size="small"
          ariaLabel="Select all assets"
        />

        <ToolbarIconButton
          icon={<DeselectIcon />}
          tooltip="Deselect"
          onClick={handleDeselectAssets}
          size="small"
          ariaLabel="Deselect assets"
        />

        <ToolbarIconButton
          icon={viewMode === "grid" ? <ViewListIcon /> : <ViewModuleIcon />}
          tooltip={`Switch to ${viewMode === "grid" ? "list" : "grid"} view`}
          onClick={handleViewModeToggle}
          size="small"
          ariaLabel={`Switch to ${viewMode === "grid" ? "list" : "grid"} view`}
        />
      </FlexRow>

      <AssetTypeFilter
        value={typeFilter}
        onChange={handleTypeFilterChange}
      />

      <NodeSelect
        variant="outlined"
        density="compact"
        className="sort-assets"
        value={settings.assetsOrder}
        onChange={(e) => handleOrderChange(String(e.target.value))}
        inputProps={{ "aria-label": "Sort assets" }}
        sx={{
          minWidth: "80px",
          textTransform: "uppercase",
          fontSize: theme.fontSizeTiny,
          color: theme.vars.palette.grey[200],
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: theme.vars.palette.grey[500],
            borderRadius: ".25em"
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "var(--palette-primary-main)"
          }
        }}
      >
        <NodeMenuItem value="name">Name</NodeMenuItem>
        <NodeMenuItem value="date">Date</NodeMenuItem>
        <NodeMenuItem value="size">Size</NodeMenuItem>
      </NodeSelect>

      {viewMode === "grid" && (
        <div className="asset-size-slider">
          <SliderBasic
            defaultValue={settings.assetItemSize}
            aria-label="Item size"
            tooltipText="Item Size"
            tooltipPlacement="bottom"
            valueLabelDisplay="auto"
            step={1}
            marks
            min={1}
            max={5}
            onChange={handleChange}
            value={settings.assetItemSize}
          />
        </div>
      )}
    </FlexRow>
  );
};

export default React.memo(WorkflowAssetToolbar, isEqual);
