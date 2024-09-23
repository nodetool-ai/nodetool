/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useEffect, useRef, useState } from "react";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import NorthWestIcon from "@mui/icons-material/NorthWest";
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
  DialogContentText,
  DialogTitle,
  ToggleButton,
  ToggleButtonGroup,
  Select,
  MenuItem
} from "@mui/material";

import useAssets from "../../serverState/useAssets";
import { useAssetStore } from "../../stores/AssetStore";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useNotificationStore } from "../../stores/NotificationStore";

import { TOOLTIP_DELAY } from "../../config/constants";
import SliderBasic from "../inputs/SliderBasic";
import dialogStyles from "../../styles/DialogStyles";
import useAuth from "../../stores/useAuth";
import { useAssetGridStore } from "../../stores/AssetGridStore";

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
      minHeight: "30px",
      backgroundColor: theme.palette.c_gray1
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
      minWidth: "20px",
      border: 0,
      margin: "0",
      padding: 0
    },
    ".asset-button-group .MuiButton-root:hover": {
      border: 0,
      color: theme.palette.c_white,
      backgroundColor: "transparent"
    },
    // size slider
    ".asset-size-slider": {
      paddingLeft: "0.25em",
      flexGrow: 0.5,
      flexShrink: 1,
      minWidth: "80px",
      maxWidth: "150px"
    },
    ".asset-size-slider .MuiSlider-root": {
      height: "25px",
      margin: "0",
      padding: "0",
      top: "0.2em"
    },
    ".asset-size-slider .MuiSlider-track": {
      backgroundColor: "transparent",
      border: "none"
    },
    // sort by
    ".sort-assets": {
      width: "42px",
      color: theme.palette.c_hl1,
      fontSize: theme.fontSizeSmaller,
      textTransform: "uppercase"
    },
    ".sort-assets:hover, .sort-assets [aria-expanded='true']": {
      color: theme.palette.c_white
    },
    ".sort-assets .MuiSelect-select": {
      border: "1px solid " + theme.palette.c_hl1,
      borderRadius: ".25em",
      padding: "0 .2em",
      textOverflow: "clip",
      backgroundColor: "transparent",
      textAlign: "center"
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
    }
  });

const AssetActions = ({
  handleSelectAllAssets,
  handleDeselectAssets,
  maxItemSize = 10
}: AssetActionsProps) => {
  const currentFolder = useAssetGridStore((state) => state.currentFolder);
  const { refetchAssetsAndFolders, navigateToFolderId, isLoading } =
    useAssets();
  const currentUser = useAuth((state) => state.getUser());
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
  const inputRef = useRef<HTMLInputElement>(null);

  const handleOrderChange = (_: any, newOrder: any) => {
    if (newOrder !== null) {
      setAssetsOrder(newOrder);
    }
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
      <ButtonGroup className="asset-button-group">
        <span>
          {/* // span is needed for disabled buttons*/}

          <Button
            disabled={!currentFolder?.parent_id}
            onClick={() => {
              navigateToFolderId(
                currentFolder?.parent_id || currentUser?.id || ""
              );
            }}
            className={`folder-up-button ${
              currentFolder?.parent_id !== "" ? " enabled" : " disabled"
            }`}
          >
            <NorthWestIcon />
          </Button>
        </span>
        <Tooltip enterDelay={TOOLTIP_DELAY} title="Create Folder">
          <Button onClick={(e) => setCreateFolderAnchor(e.currentTarget)}>
            <CreateNewFolderIcon />
          </Button>
        </Tooltip>
        <Tooltip enterDelay={TOOLTIP_DELAY} title="Select all">
          <Button onClick={handleSelectAllAssets}>
            <SelectAllIcon />
          </Button>
        </Tooltip>
        <Tooltip enterDelay={TOOLTIP_DELAY} title="Deselect">
          <Button onClick={handleDeselectAssets}>
            <DeselectIcon />
          </Button>
        </Tooltip>
        <Tooltip enterDelay={TOOLTIP_DELAY} title="Refresh">
          <Button onClick={() => refetchAssetsAndFolders()}>
            <Refresh />
          </Button>
        </Tooltip>

        {isLoading && (
          <div
            className={`loading-indicator ${isLoading ? "loading" : ""}`}
            style={{
              position: "absolute",
              right: "5px",
              top: "10px",
              left: "unset",
              width: "50px"
            }}
          >
            <CircularProgress />
          </div>
        )}
      </ButtonGroup>

      <Tooltip enterDelay={TOOLTIP_DELAY} title="Sort assets" placement="top">
        <Select
          variant="standard"
          className="sort-assets"
          value={settings.assetsOrder}
          onChange={(e) => handleOrderChange(null, e.target.value)}
          displayEmpty
          inputProps={{ "aria-label": "Sort assets" }}
        >
          <MenuItem value="name">Name</MenuItem>
          <MenuItem value="date">Date</MenuItem>
        </Select>
      </Tooltip>

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
