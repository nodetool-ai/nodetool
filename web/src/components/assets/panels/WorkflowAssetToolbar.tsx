/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback } from "react";
import {
  ButtonGroup,
  Tooltip,
  Box,
  Button,
  Select,
  MenuItem
} from "@mui/material";
import SelectAllIcon from "@mui/icons-material/SelectAll";
import DeselectIcon from "@mui/icons-material/Deselect";
import ViewListIcon from "@mui/icons-material/ViewList";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { UploadButton } from "../../ui_primitives";
import { useAssetGridStore } from "../../../stores/AssetGridStore";
import { useSettingsStore } from "../../../stores/SettingsStore";
import { useAssetSelection } from "../../../hooks/assets/useAssetSelection";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";
import SliderBasic from "../../inputs/SliderBasic";
import { Asset } from "../../../stores/ApiTypes";
import isEqual from "lodash/isEqual";

interface WorkflowAssetToolbarProps {
  assets: Asset[];
  onUpload: (args: { file: File; onProgress?: (progress: number) => void }) => void;
  _isUploading?: boolean;
}

const styles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexWrap: "wrap",
      gap: ".5em",
      padding: "0.5em",
      alignItems: "center",
      backgroundColor: theme.vars.palette.c_editor_bg_color,
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    ".asset-button-group": {
      display: "flex",
      alignItems: "center",
      gap: "0.25em"
    },
    ".asset-button-group button": {
      minWidth: "32px",
      height: "32px",
      padding: "4px",
      color: theme.vars.palette.grey[200],
      "&:hover": {
        color: "var(--palette-primary-main)",
        backgroundColor: "transparent"
      }
    },
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
  ]);
  const [settings, setAssetItemSize, setAssetsOrder] = useSettingsStore((state) => [
    state.settings,
    state.setAssetItemSize,
    state.setAssetsOrder
  ]);


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
    <Box css={styles(theme)} className="workflow-asset-toolbar">
      <UploadButton
        onFileSelect={handleUpload}
        iconVariant="file"
        tooltip="Upload files"
        multiple
      />
      
      <ButtonGroup className="asset-button-group" size="small">
        <Tooltip
          enterDelay={TOOLTIP_ENTER_DELAY}
          title="Select all"
          disableInteractive
        >
          <Button onClick={handleSelectAllAssets}>
            <SelectAllIcon />
          </Button>
        </Tooltip>
        
        <Tooltip
          enterDelay={TOOLTIP_ENTER_DELAY}
          title="Deselect"
          disableInteractive
        >
          <Button onClick={handleDeselectAssets}>
            <DeselectIcon />
          </Button>
        </Tooltip>
        
        <Tooltip
          enterDelay={TOOLTIP_ENTER_DELAY}
          title={`Switch to ${viewMode === "grid" ? "list" : "grid"} view`}
          disableInteractive
        >
          <Button onClick={handleViewModeToggle}>
            {viewMode === "grid" ? <ViewListIcon /> : <ViewModuleIcon />}
          </Button>
        </Tooltip>
      </ButtonGroup>

      <Tooltip
        enterDelay={TOOLTIP_ENTER_DELAY}
        title="Sort assets"
        placement="bottom"
        disableInteractive
      >
        <Select
          variant="standard"
          className="sort-assets"
          value={settings.assetsOrder}
          onChange={(e) => handleOrderChange(e.target.value)}
          displayEmpty
          inputProps={{ "aria-label": "Sort assets" }}
        >
          <MenuItem value="name">Name</MenuItem>
          <MenuItem value="date">Date</MenuItem>
          <MenuItem value="size">Size</MenuItem>
        </Select>
      </Tooltip>

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
    </Box>
  );
};

export default React.memo(WorkflowAssetToolbar, isEqual);
