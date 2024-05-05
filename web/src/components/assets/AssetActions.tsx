/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useEffect, useRef, useState } from "react";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import NorthWestIcon from "@mui/icons-material/NorthWest";
import SelectAllIcon from "@mui/icons-material/SelectAll";
import DeselectIcon from "@mui/icons-material/Deselect";
import { Refresh } from "@mui/icons-material";
import {
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  ToggleButton,
  ToggleButtonGroup
} from "@mui/material";

import {
  Button,
  ButtonGroup,
  CircularProgress,
  Tooltip,
  Popover,
  TextField
} from "@mui/material";

import useAssets from "../../serverState/useAssets";
import { useAssetStore } from "../../stores/AssetStore";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useNotificationStore } from "../../stores/NotificationStore";

import { TOOLTIP_DELAY } from "../../config/constants";
import SliderBasic from "../inputs/SliderBasic";
import dialogStyles from "../../styles/DialogStyles";

interface AssetActionsProps {
  setSelectedAssetIds: (assetIds: string[]) => void;
  handleSelectAllAssets: () => void;
  handleDeselectAssets: () => void;
  maxItemSize?: number;
}

const styles = (theme: any) =>
  css({
    "&": {
      width: "100%",
      minHeight: "30px",
      backgroundColor: theme.palette.c_gray1
    },
    "& p": {
      display: "inline-block"
    },
    ".asset-button-group": {
      width: "100%",
      display: "flex",
      alignItems: "center",
      gap: "0.5em",
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
    ".asset-size-slider": {
      flexGrow: 1,
      maxWidth: "95px"
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
    ".sort-assets": {
      marginTop: "0.5em",
      height: "20px",
      display: "flex",
      gap: ".5em"
    },
    ".sort-assets button": {
      color: theme.palette.c_gray4,
      backgroundColor: "transparent",
      border: 0,
      padding: 0,

      fontSize: theme.fontSizeSmaller
    },
    ".sort-assets button.Mui-selected": {
      color: theme.palette.c_hl1
    }
  });

const AssetActions = ({
  setSelectedAssetIds,
  handleSelectAllAssets,
  handleDeselectAssets,
  maxItemSize = 10
}: AssetActionsProps) => {
  const { currentFolder, setCurrentFolderId } = useAssetStore();
  const { refetch, isLoading } = useAssets();
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

  return (
    <div className="asset-actions" css={styles}>
      <ButtonGroup className="asset-button-group">
        <span>
          {/* // span is needed for disabled buttons*/}
          <Button
            disabled={!currentFolder?.parent_id}
            onClick={() => {
              setCurrentFolderId(currentFolder?.parent_id || "");
              setSelectedAssetIds([]);
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
          <Button onClick={() => refetch()}>
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

      <ToggleButtonGroup
        className="sort-assets"
        value={settings.assetsOrder}
        onChange={handleOrderChange}
        exclusive
        aria-label="Sort assets"
      >
        <ToggleButton value="name" aria-label="Sort by name">
          Name
        </ToggleButton>
        <ToggleButton value="date" aria-label="sort by date">
          Date
        </ToggleButton>
      </ToggleButtonGroup>

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
          <DialogContentText id="alert-dialog-description">
            <TextField
              className="input-field"
              inputRef={inputRef}
              autoFocus
              id="name"
              onChange={(e) => setCreateFolderName(e.target.value)}
              fullWidth
            />
          </DialogContentText>
        </DialogContent>
        <DialogActions className="dialog-actions">
          <Button
            className="button-cancel"
            onClick={() => setCreateFolderAnchor(null)}
          >
            Cancel
          </Button>
          <Button
            className="button-confirm"
            onClick={() => {
              setCreateFolderAnchor(null);
              createFolder(currentFolder?.id || "", createFolderName).then(
                () => {
                  addNotification({
                    type: "success",
                    content: `CREATE FOLDER: ${createFolderName}`
                  });
                  refetch();
                }
              );
            }}
          >
            Create Folder
          </Button>
        </DialogActions>
      </Popover>
    </div>
  );
};

export default AssetActions;
