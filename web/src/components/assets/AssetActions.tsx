/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useEffect, useRef, useState } from "react";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import NorthIcon from "@mui/icons-material/North";
import SelectAllIcon from "@mui/icons-material/SelectAll";
import DeselectIcon from "@mui/icons-material/Deselect";
import { Refresh } from "@mui/icons-material";
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
import useAuth from "../../stores/useAuth";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { SIZE_FILTERS, SizeFilterKey } from "../../utils/formatUtils";
import ViewListIcon from "@mui/icons-material/ViewList";
import ViewModuleIcon from "@mui/icons-material/ViewModule";

interface AssetActionsProps {
  setSelectedAssetIds: (assetIds: string[]) => void;
  handleSelectAllAssets: () => void;
  handleDeselectAssets: () => void;
  maxItemSize?: number;
}

const styles = (theme: any) =>
  css({
    "&": {
      display: "flex",
      flexWrap: "wrap",
      gap: ".25em",
      maxWidth: "500px",
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
      color: theme.palette.c_gray5,
      minWidth: "20px",
      border: 0,
      margin: "0",
      padding: 0
    },
    ".asset-button-group .MuiButton-root:hover": {
      border: 0,
      color: theme.palette.c_hl1,
      backgroundColor: "transparent"
    },
    ".asset-button-group .MuiButton-root.disabled": {
      color: theme.palette.c_gray4
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
      color: theme.palette.c_gray5
    },
    ".asset-size-slider .MuiSlider-root:hover": {
      color: theme.palette.c_hl1
    },
    ".asset-size-slider .MuiSlider-root:hover .MuiSlider-thumb": {
      backgroundColor: theme.palette.c_hl1
    },
    ".asset-size-slider .MuiSlider-track": {
      backgroundColor: "transparent",
      border: "none"
    },
    // sort by
    ".sort-assets": {
      width: "45px",
      margin: "0 1em",
      color: theme.palette.c_hl1,
      fontSize: theme.fontSizeSmaller,
      textTransform: "uppercase",
      position: "relative"
    },
    ".sort-assets:hover, .sort-assets [aria-expanded='true']": {
      color: theme.palette.c_white
    },
    ".sort-assets .MuiSelect-select": {
      color: theme.palette.c_gray5,
      border: "1px solid " + theme.palette.c_gray5,
      borderRadius: ".25em",
      padding: "0 .25em",
      textOverflow: "clip",
      backgroundColor: "transparent",
      textAlign: "center",
      boxSizing: "border-box",
      lineHeight: "1.2",
      height: "auto"
    },

    ".sort-assets .MuiSelect-select:hover": {
      border: "1px solid " + theme.palette.c_hl1,
      borderRadius: ".25em",
      padding: "0 .25em",
      textOverflow: "clip",
      backgroundColor: "transparent",
      textAlign: "center",
      boxSizing: "border-box",
      lineHeight: "1.2",
      height: "auto"
    },

    ".sort-assets .MuiSelect-icon": {
      display: "none",
      color: theme.palette.c_hl1,
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
      width: "90px",
      margin: "0",
      color: theme.palette.c_hl1,
      fontSize: theme.fontSizeSmaller,
      textTransform: "uppercase",
      position: "relative"
    },
    ".size-filter:hover, .size-filter [aria-expanded='true']": {
      color: theme.palette.c_white
    },
    ".size-filter .MuiSelect-select": {
      color: theme.palette.c_gray5,
      border: "1px solid " + theme.palette.c_gray5,
      borderRadius: ".25em",
      padding: "0 .25em",
      textOverflow: "ellipsis",
      backgroundColor: "transparent",
      textAlign: "center",
      boxSizing: "border-box",
      lineHeight: "1.2",
      height: "auto"
    },
    ".size-filter .MuiSelect-select:hover": {
      border: "1px solid " + theme.palette.c_hl1,
      color: theme.palette.c_hl1
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
    }
  });

const AssetActions = ({
  handleSelectAllAssets,
  handleDeselectAssets,
  maxItemSize = 10
}: AssetActionsProps) => {
  const currentFolder = useAssetGridStore((state) => state.currentFolder);
  const parentFolder = useAssetGridStore((state) => state.parentFolder);
  const { refetchAssetsAndFolders, navigateToFolderId, isLoading } =
    useAssets();
  const currentUser = useAuth((state) => state.user);
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

  const handleOrderChange = (_: any, newOrder: any) => {
    if (newOrder !== null) {
      setAssetsOrder(newOrder);
    }
  };

  const handleSizeFilterChange = (_: any, newSizeFilter: SizeFilterKey) => {
    if (newSizeFilter !== null) {
      setSizeFilter(newSizeFilter);
    }
  };

  const handleViewModeToggle = () => {
    setViewMode(viewMode === "grid" ? "list" : "grid");
  };

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

  const handleChange = (event: Event, value: number | number[]) => {
    if (Array.isArray(value)) {
      setAssetItemSize(value[0] as number);
    } else {
      setAssetItemSize(value as number);
    }
  };
  const handleCreateFolder = () => {
    setCreateFolderAnchor(null);
    createFolder(currentFolder?.id || "", createFolderName).then(() => {
      addNotification({
        type: "success",
        content: `CREATE FOLDER: ${createFolderName}`
      });
      setCreateFolderAnchor(null);
      refetchAssetsAndFolders();
    });
  };
  return (
    <div className="asset-actions" css={styles}>
      <ButtonGroup className="asset-button-group" tabIndex={-1}>
        <Tooltip
          enterDelay={TOOLTIP_ENTER_DELAY}
          title={parentFolder?.name ? `Up to "${parentFolder?.name}"` : "Go up"}
        >
          <Button
            sx={{
              width: "2em",
              height: "2em",
              borderRadius: "50%",
              padding: "0",
              margin: "0",
              "& svg": {
                height: ".75em",
                width: "1em"
              }
            }}
            onClick={() => {
              if (currentFolder?.parent_id) {
                navigateToFolderId(
                  currentFolder?.parent_id || currentUser?.id || ""
                );
              }
            }}
            className={`folder-up-button ${
              currentFolder?.parent_id !== "" ? " enabled" : " disabled"
            }`}
            tabIndex={-1}
          >
            <NorthIcon />
          </Button>
        </Tooltip>
        <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="Create Folder">
          <Button
            onClick={(e) => setCreateFolderAnchor(e.currentTarget)}
            tabIndex={-1}
          >
            <CreateNewFolderIcon />
          </Button>
        </Tooltip>
        <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="Select all">
          <Button onClick={handleSelectAllAssets} tabIndex={-1}>
            <SelectAllIcon />
          </Button>
        </Tooltip>
        <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="Deselect">
          <Button onClick={handleDeselectAssets} tabIndex={-1}>
            <DeselectIcon />
          </Button>
        </Tooltip>
        <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="Refresh">
          <Button onClick={() => refetchAssetsAndFolders()} tabIndex={-1}>
            <Refresh />
          </Button>
        </Tooltip>
        <Tooltip
          enterDelay={TOOLTIP_ENTER_DELAY}
          title={`Switch to ${viewMode === "grid" ? "list" : "grid"} view`}
        >
          <Button onClick={handleViewModeToggle} tabIndex={-1}>
            {viewMode === "grid" ? <ViewListIcon /> : <ViewModuleIcon />}
          </Button>
        </Tooltip>

        {isLoading && (
          <Box
            className={`loading-indicator ${isLoading ? "loading" : ""}`}
            sx={{
              position: "absolute",
              right: "4em",
              top: "1.4em",
              left: "unset",
              "& span": {
                height: "1em !important",
                width: "1em !important"
              }
            }}
          >
            <CircularProgress />
          </Box>
        )}
      </ButtonGroup>

      <Tooltip
        enterDelay={TOOLTIP_ENTER_DELAY}
        title="Sort assets"
        placement="bottom"
      >
        <Select
          variant="standard"
          className="sort-assets"
          value={settings.assetsOrder}
          onChange={(e) => handleOrderChange(null, e.target.value)}
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
          onChange={(e) =>
            handleSizeFilterChange(null, e.target.value as SizeFilterKey)
          }
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
        css={dialogStyles}
        style={{ minWidth: "100%", minHeight: "100%" }}
        className="dialog"
        open={Boolean(createFolderAnchor)}
        anchorEl={createFolderAnchor}
        onClose={() => setCreateFolderAnchor(null)}
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
            onClick={() => setCreateFolderAnchor(null)}
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

export default AssetActions;
