/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useEffect, useRef, useState, useCallback, memo, useMemo } from "react";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import SelectAllIcon from "@mui/icons-material/SelectAll";
import DeselectIcon from "@mui/icons-material/Deselect";
import {
  Button,
  ButtonGroup,
  CircularProgress,
  Tooltip,
  Popover,
  TextField,
  DialogActions,
  DialogContent,
  DialogTitle,
  Select,
  MenuItem,
  Box
} from "@mui/material";

import useAssets from "../../serverState/useAssets";
import { useAssetStore } from "../../stores/AssetStore";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useNotificationStore } from "../../stores/NotificationStore";

import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import SliderBasic from "../inputs/SliderBasic";
import dialogStyles from "../../styles/DialogStyles";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { SIZE_FILTERS, SizeFilterKey } from "../../utils/formatUtils";
import ViewListIcon from "@mui/icons-material/ViewList";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { UploadButton } from "../ui_primitives";

interface AssetActionsProps {
  setSelectedAssetIds: (assetIds: string[]) => void;
  handleSelectAllAssets: () => void;
  handleDeselectAssets: () => void;
  maxItemSize?: number;
  onUploadFiles?: (files: File[]) => void;
}

const styles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexWrap: "wrap",
      gap: ".25em",
      maxWidth: "100%",
      flexGrow: 1,
      minHeight: "30px"
    },
    "& p": {
      display: "inline-block"
    },
    ".asset-button-group": {
      width: "auto",
      display: "flex",
      alignItems: "center",
      gap: "0.25em",
      border: 0,
      padding: 0
    },
    ".asset-button-group.MuiButtonGroup-root button": {
      color: theme.vars.palette.grey[200],
      minWidth: "20px",
      border: 0,
      margin: "0",
      padding: 0
    },

    // Smaller, cleaner icons in the asset toolbar
    ".asset-button-group .MuiSvgIcon-root, .asset-button-group svg": {
      fontSize: "18px",
      width: "18px",
      height: "18px",
      color: theme.vars.palette.grey[400]
    },
    ".asset-button-group .MuiButton-root:hover": {
      border: 0,
      color: "var(--palette-primary-main)",
      backgroundColor: "transparent"
    },
    ".asset-button-group .MuiButton-root.disabled": {
      color: theme.vars.palette.grey[400]
    },
    // size slider
    ".asset-size-slider": {
      paddingLeft: "0.25em",
      flexGrow: 1,
      flexShrink: 1,
      paddingRight: "0.5em",
      minWidth: "80px",
      maxWidth: "170px"
    },
    ".asset-size-slider .MuiSlider-root": {
      height: "25px",
      margin: "0",
      padding: "0",
      top: "0.2em",
      color: theme.vars.palette.grey[200]
    },
    ".asset-size-slider .MuiSlider-root:hover": {
      color: "var(--palette-primary-main)"
    },
    ".asset-size-slider .MuiSlider-root:hover .MuiSlider-thumb": {
      backgroundColor: "var(--palette-primary-main)"
    },
    ".asset-size-slider .MuiSlider-track": {
      backgroundColor: "transparent",
      border: "none"
    },
    // sort by
    ".sort-assets": {
      margin: "0 .5em",
      color: "var(--palette-primary-main)",
      fontSize: theme.fontSizeTiny,
      textTransform: "uppercase",
      position: "relative"
    },
    ".sort-assets:hover, .sort-assets [aria-expanded='true']": {
      color: theme.vars.palette.grey[0]
    },
    ".sort-assets .MuiSelect-select": {
      color: theme.vars.palette.grey[200],
      border: "1px solid " + theme.vars.palette.grey[500],
      borderRadius: ".25em",
      padding: "0.5em",
      textOverflow: "clip",
      backgroundColor: "transparent",
      textAlign: "center",
      boxSizing: "border-box",
      lineHeight: "1.2",
      height: "auto"
    },

    ".sort-assets .MuiSelect-select:hover": {
      border: "1px solid " + "var(--palette-primary-main)",
      borderRadius: ".25em",
      backgroundColor: "transparent"
    },

    ".sort-assets .MuiSelect-icon": {
      display: "none",
      color: "var(--palette-primary-main)",
      right: "0"
    },
    ".sort-assets.MuiInput-root::before": {
      borderBottom: "none"
    },
    ".sort-assets.MuiInput-root::after": {
      borderBottom: "none"
    },
    ".sort-assets.MuiInput-root:hover::before": {
      border: "none !important  "
    },
    ".sort-assets.MuiInput-root:hover::after": {
      border: "none"
    },
    // size filter
    ".size-filter": {
      margin: "0",
      padding: "0 0.25em",
      color: "var(--palette-primary-main)",
      fontSize: theme.fontSizeTiny,
      textTransform: "uppercase",
      position: "relative"
    },
    ".size-filter:hover, .size-filter [aria-expanded='true']": {
      color: theme.vars.palette.grey[0]
    },
    ".size-filter .MuiSelect-select": {
      color: theme.vars.palette.grey[200],
      border: "1px solid " + theme.vars.palette.grey[500],
      borderRadius: ".25em",
      padding: "0.5em",
      textOverflow: "ellipsis",
      backgroundColor: "transparent",
      textAlign: "center",
      boxSizing: "border-box",
      lineHeight: "1.2",
      height: "auto"
    },
    ".size-filter .MuiSelect-select:hover": {
      border: "1px solid " + "var(--palette-primary-main)",
      color: "var(--palette-primary-main)"
    },
    ".size-filter .MuiSelect-icon": {
      display: "none"
    },
    ".size-filter.MuiInput-root::before": {
      borderBottom: "none"
    },
    ".size-filter.MuiInput-root::after": {
      borderBottom: "none"
    },
    ".size-filter.MuiInput-root:hover::before": {
      border: "none !important"
    },
    ".size-filter.MuiInput-root:hover::after": {
      border: "none"
    },
    // Stack controls on very narrow widths
    "@media (max-width: 520px)": {
      "&": {
        flexDirection: "column",
        alignItems: "stretch"
      },
      ".asset-button-group": {
        justifyContent: "flex-start",
        flexWrap: "wrap"
      },
      ".sort-assets, .size-filter": {
        margin: "0",
        width: "100%",
        maxWidth: "100%"
      },
      ".asset-size-slider": {
        maxWidth: "100%"
      }
    }
  });

const AssetActions = ({
  handleSelectAllAssets,
  handleDeselectAssets,
  maxItemSize = 10,
  onUploadFiles
}: AssetActionsProps) => {
  const theme = useTheme();
  const currentFolder = useAssetGridStore((state) => state.currentFolder);
  const { refetchAssetsAndFolders, isLoading } =
    useAssets();
  const [createFolderAnchor, setCreateFolderAnchor] =
    useState<HTMLButtonElement | null>(null);
  const [createFolderName, setCreateFolderName] =
    useState<string>("New Folder");
  const createFolder = useAssetStore((state) => state.createFolder);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const [settings, setAssetItemSize, setAssetsOrder] = useSettingsStore(
    (state) => [state.settings, state.setAssetItemSize, state.setAssetsOrder]
  );
  const [sizeFilter, setSizeFilter] = useAssetGridStore((state) => [
    state.sizeFilter,
    state.setSizeFilter
  ]);
  const [viewMode, setViewMode] = useAssetGridStore((state) => [
    state.viewMode,
    state.setViewMode
  ]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleOrderChange = useCallback((_event: unknown, newOrder: "name" | "date" | "size" | null) => {
    if (newOrder !== null) {
      setAssetsOrder(newOrder);
    }
  }, [setAssetsOrder]);

  const handleSizeFilterChange = useCallback((_event: unknown, newSizeFilter: SizeFilterKey | null) => {
    if (newSizeFilter !== null) {
      setSizeFilter(newSizeFilter);
    }
  }, [setSizeFilter]);

  const handleViewModeToggle = useCallback(() => {
    setViewMode(viewMode === "grid" ? "list" : "grid");
  }, [viewMode, setViewMode]);

  const handleCloseCreateFolder = useCallback(() => {
    setCreateFolderAnchor(null);
  }, []);

  useEffect(() => {
    if (createFolderAnchor) {
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [createFolderAnchor]);

  const handleChange = useCallback((event: Event, value: number | number[]) => {
    if (Array.isArray(value)) {
      setAssetItemSize(value[0] as number);
    } else {
      setAssetItemSize(value as number);
    }
  }, [setAssetItemSize]);

  const loadingIndicatorStyle = useMemo(() => ({
    position: "absolute" as const,
    right: "4em",
    top: "1.4em",
    left: "unset",
    "& span": {
      height: "1em !important",
      width: "1em !important"
    }
  }), []);

  const handleCreateFolder = useCallback(() => {
    setCreateFolderAnchor(null);
    createFolder(currentFolder?.id || "", createFolderName).then(() => {
      addNotification({
        type: "success",
        content: `CREATE FOLDER: ${createFolderName}`
      });
      setCreateFolderAnchor(null);
      refetchAssetsAndFolders();
    });
  }, [createFolder, currentFolder?.id, createFolderName, addNotification, refetchAssetsAndFolders]);
  return (
    <div className="asset-actions" css={styles(theme)}>
      <UploadButton
        onFileSelect={(files) => onUploadFiles?.(files)}
        iconVariant="file"
        tooltip="Upload files"
        multiple
      />
      <ButtonGroup className="asset-button-group" size="small" tabIndex={-1}>
        <Tooltip
          enterDelay={TOOLTIP_ENTER_DELAY}
          title="Create Folder"
          disableInteractive
        >
          <Button
            onClick={(e) => setCreateFolderAnchor(e.currentTarget)}
            tabIndex={-1}
          >
            <CreateNewFolderIcon />
          </Button>
        </Tooltip>
        <Tooltip
          enterDelay={TOOLTIP_ENTER_DELAY}
          title="Select all"
          disableInteractive
        >
          <Button onClick={handleSelectAllAssets} tabIndex={-1}>
            <SelectAllIcon />
          </Button>
        </Tooltip>
        <Tooltip
          enterDelay={TOOLTIP_ENTER_DELAY}
          title="Deselect"
          disableInteractive
        >
          <Button onClick={handleDeselectAssets} tabIndex={-1}>
            <DeselectIcon />
          </Button>
        </Tooltip>
        <Tooltip
          enterDelay={TOOLTIP_ENTER_DELAY}
          title={`Switch to ${viewMode === "grid" ? "list" : "grid"} view`}
          disableInteractive
        >
          <Button onClick={handleViewModeToggle} tabIndex={-1}>
            {viewMode === "grid" ? <ViewListIcon /> : <ViewModuleIcon />}
          </Button>
        </Tooltip>

        {isLoading && (
          <Box
            className={`loading-indicator ${isLoading ? "loading" : ""}`}
            sx={loadingIndicatorStyle}
          >
            <CircularProgress />
          </Box>
        )}
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
          onChange={(e) => handleOrderChange(e, e.target.value as "name" | "date" | "size")}
          displayEmpty
          inputProps={{ "aria-label": "Sort assets" }}
          tabIndex={-1}
        >
          <MenuItem value="name">Name</MenuItem>
          <MenuItem value="date">Date</MenuItem>
          <MenuItem value="size">Size</MenuItem>
        </Select>
      </Tooltip>

      <Tooltip
        enterDelay={TOOLTIP_ENTER_DELAY}
        title="Filter by file size"
        placement="bottom"
        disableInteractive
      >
        <Select
          className="size-filter"
          variant="standard"
          value={sizeFilter}
          sx={{
            "& .MuiSelect-select": {
              minWidth: "80px"
            }
          }}
          onChange={(e) => handleSizeFilterChange(e, e.target.value as SizeFilterKey)}
          displayEmpty
          inputProps={{ "aria-label": "Filter by size" }}
          tabIndex={-1}
        >
          {SIZE_FILTERS.map((filter) => (
            <MenuItem key={filter.key} value={filter.key}>
              {filter.label}
            </MenuItem>
          ))}
        </Select>
      </Tooltip>

      {viewMode === "grid" && (
        <div className="asset-size-slider">
          <SliderBasic
            defaultValue={settings.assetItemSize}
            aria-label="Small"
            tooltipText="Item Size"
            tooltipPlacement="bottom"
            valueLabelDisplay="auto"
            step={1}
            marks
            min={1}
            max={maxItemSize}
            onChange={handleChange}
            value={settings.assetItemSize}
          />
        </div>
      )}
      <Popover
        css={dialogStyles(theme)}
        style={{ minWidth: "100%", minHeight: "100%" }}
        className="dialog"
        open={Boolean(createFolderAnchor)}
        anchorEl={createFolderAnchor}
        onClose={handleCloseCreateFolder}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle className="dialog-title" id="alert-dialog-title">
          {"Create Folder"}
        </DialogTitle>
        <DialogContent className="dialog-content">
          <div>
            <TextField
              className="input-field"
              inputRef={inputRef}
              placeholder="Folder Name"
              autoFocus
              autoComplete="off"
              id="name"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleCreateFolder();
                }
              }}
              onChange={(e) => setCreateFolderName(e.target.value)}
              fullWidth
            />
          </div>
        </DialogContent>
        <DialogActions className="dialog-actions">
          <Button
            className="button-cancel"
            onClick={handleCloseCreateFolder}
          >
            Cancel
          </Button>
          <Button className="button-confirm" onClick={handleCreateFolder}>
            Create Folder
          </Button>
        </DialogActions>
      </Popover>
    </div>
  );
};

AssetActions.displayName = "AssetActions";

export default memo(AssetActions);
