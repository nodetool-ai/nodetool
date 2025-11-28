import type { MouseEvent } from "react";
//mui
import { Divider, Menu, MenuItem, Typography } from "@mui/material";
import ContextMenuItem from "./ContextMenuItem";
//icons
import RemoveCircleIcon from "@mui/icons-material/RemoveCircle";
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline";
import DriveFileMoveIcon from "@mui/icons-material/DriveFileMove";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
//store
import useContextMenuStore from "../../stores/ContextMenuStore";
import { useAssetStore } from "../../stores/AssetStore";
import log from "loglevel";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useNotificationStore } from "../../stores/NotificationStore";
const AssetItemContextMenu = () => {
  const menuPosition = useContextMenuStore((state) => state.menuPosition);
  const closeContextMenu = useContextMenuStore(
    (state) => state.closeContextMenu
  );
  const setRenameDialogOpen = useAssetGridStore(
    (state) => state.setRenameDialogOpen
  );
  const setMoveToFolderDialogOpen = useAssetGridStore(
    (state) => state.setMoveToFolderDialogOpen
  );
  const setDeleteDialogOpen = useAssetGridStore(
    (state) => state.setDeleteDialogOpen
  );
  const selectedAssetIds = useAssetGridStore((state) => state.selectedAssetIds);
  const selectedAssets = useAssetGridStore((state) => state.selectedAssets);
  const download = useAssetStore((state) => state.download);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const setCreateFolderDialogOpen = useAssetGridStore(
    (state) => state.setCreateFolderDialogOpen
  );

  // Check if any selected items are folders
  const isFolder = selectedAssets.some(
    (asset) => asset.content_type === "folder"
  );

  // Determine if we have non-folder assets selected for moving to new folder
  const hasSelectedAssets = selectedAssets.length > 0 && !isFolder;

  const handleDownloadAssets = async (selectedAssetIds: string[]) => {
    addNotification({
      type: "info",
      content: "Download started. This may take a while.",
      alert: true
    });
    try {
      await download(selectedAssetIds);
      addNotification({
        type: "success",
        content: "Download finished successfully.",
        alert: true
      });
    } catch (error) {
      log.error("Download failed", error);
      addNotification({
        type: "error",
        content: "Download failed. Please check the console for more details.",
        alert: true
      });
    }
  };

  const withMenuClose =
    (action: () => Promise<void> | void) =>
    async (event?: MouseEvent<HTMLElement>) => {
      event?.stopPropagation();
      await action();
      closeContextMenu();
    };

  const openRenameDialog = withMenuClose(() => setRenameDialogOpen(true));
  const openMoveDialog = withMenuClose(() => setMoveToFolderDialogOpen(true));
  const openCreateFolderDialog = withMenuClose(() =>
    setCreateFolderDialogOpen(true)
  );
  const openDeleteDialog = withMenuClose(() => setDeleteDialogOpen(true));
  const downloadSelected = withMenuClose(async () => {
    await handleDownloadAssets(selectedAssetIds);
  });

  if (!menuPosition) return null;
  return (
    <>
      <Menu
        className="context-menu asset-item-context-menu"
        open={menuPosition !== null}
        onClose={closeContextMenu}
        onContextMenu={(event) => event.preventDefault()}
        anchorReference="anchorPosition"
        style={{ padding: "1em" }}
        anchorPosition={
          menuPosition
            ? { top: menuPosition.y, left: menuPosition.x }
            : undefined
        }
      >
        <MenuItem disabled>
          <Typography variant="body1" className="title">
            {isFolder
              ? "Folder"
              : `${selectedAssetIds.length} item${
                  selectedAssetIds.length > 1 ? "s" : ""
                }`}
          </Typography>
        </MenuItem>
        <Divider />
        <ContextMenuItem
          onClick={openRenameDialog}
          label="Rename"
          IconComponent={<DriveFileRenameOutlineIcon />}
          tooltip="Rename selected assets"
        />
        <Divider />
        <ContextMenuItem
          onClick={openMoveDialog}
          label="Move to existing folder"
          IconComponent={<DriveFileMoveIcon />}
          tooltip="Move selected assets to an existing folder"
        />
        <ContextMenuItem
          onClick={openCreateFolderDialog}
          label={hasSelectedAssets ? "Move to new folder" : "Create new folder"}
          IconComponent={<CreateNewFolderIcon />}
          tooltip={
            hasSelectedAssets
              ? "Create a new folder and move selected assets into it"
              : "Create a new folder in the current location"
          }
        />
        <Divider />
        <ContextMenuItem
          onClick={downloadSelected}
          label="Download Selected Assets"
          IconComponent={<FileDownloadIcon />}
          tooltip="Download selected assets to your Downloads folder"
        />
        <Divider />
        <div style={{ height: ".5em" }} />
        <ContextMenuItem
          onClick={openDeleteDialog}
          label="Delete"
          addButtonClassName="delete"
          IconComponent={<RemoveCircleIcon />}
          tooltip="Delete selected assets"
        />
      </Menu>
    </>
  );
};

export default AssetItemContextMenu;
