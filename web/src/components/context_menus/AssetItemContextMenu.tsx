//mui
import { Divider, Menu, MenuItem, Typography } from "@mui/material";
import ContextMenuItem from "./ContextMenuItem";
//icons
import RemoveCircleIcon from "@mui/icons-material/RemoveCircle";
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline";
import DriveFileMoveIcon from "@mui/icons-material/DriveFileMove";
//store
import useContextMenuStore from "../../stores/ContextMenuStore";
import useSessionStateStore from "../../stores/SessionStateStore";
import { useAssetStore } from "../../stores/AssetStore";
import { devLog } from "../../utils/DevLog";

interface AssetItemContextMenuProps {
  openDeleteDialog: () => void;
  openRenameDialog: () => void;
  openMoveToFolderDialog: () => void;
}

const AssetItemContextMenu = ({
  openDeleteDialog,
  openRenameDialog,
  openMoveToFolderDialog,
}: AssetItemContextMenuProps) => {
  const openMenuType = useContextMenuStore((state) => state.openMenuType);
  const menuPosition = useContextMenuStore((state) => state.menuPosition);
  const selectedAssetIds = useSessionStateStore(
    (state) => state.selectedAssetIds
  );
  const download = useAssetStore((state) => state.download);

  const handleDownloadAssets = (selectedAssetIds: string[]) => {
    devLog("AssetItemContextMenu: Download assets", selectedAssetIds);
    download(selectedAssetIds);
  };

  if (openMenuType !== "asset-item-context-menu" || !menuPosition) return null;
  return (
    <>
      <Menu
        className="context-menu asset-item-context-menu"
        open={menuPosition !== null}
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
            {selectedAssetIds.length} item{selectedAssetIds.length > 1 && "s"}
          </Typography>
        </MenuItem>
        <Divider />
        <ContextMenuItem
          onClick={(e: any) => {
            e.stopPropagation();
            openRenameDialog();
          }}
          label="Rename"
          IconComponent={<DriveFileRenameOutlineIcon />}
          tooltip="Rename selected assets"
        />
        <ContextMenuItem
          onClick={(e: any) => {
            e.stopPropagation();
            openMoveToFolderDialog();
          }}
          label="Move to folder"
          IconComponent={<DriveFileMoveIcon />}
          tooltip="Move selected assets to a different folder"
        />
        <ContextMenuItem
          onClick={(e: any) => {
            e.stopPropagation();
            handleDownloadAssets(selectedAssetIds);
          }}
          label="Download Selected Assets"
          IconComponent={<DriveFileMoveIcon />}
          tooltip="Move selected assets to a different folder"
        />
        <Divider />
        <ContextMenuItem
          onClick={(e) => {
            if (e) {
              e.stopPropagation();
              openDeleteDialog();
            }
          }}
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
