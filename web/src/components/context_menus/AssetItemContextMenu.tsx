//mui
import { Divider, Menu, MenuItem, Typography } from "@mui/material";
import ContextMenuItem from "./ContextMenuItem";
//icons
import RemoveCircleIcon from "@mui/icons-material/RemoveCircle";
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline";
//store
import useContextMenuStore from "../../stores/ContextMenuStore";
import useSessionStateStore from "../../stores/SessionStateStore";

interface AssetItemContextMenuProps {
  openDeleteDialog: () => void;
  openRenameDialog: () => void;
}

const AssetItemContextMenu = ({
  openDeleteDialog,
  openRenameDialog
}: AssetItemContextMenuProps) => {
  const { openMenuType, menuPosition } = useContextMenuStore();
  const { selectedAssetIds } = useSessionStateStore();

  if (openMenuType !== "asset-item-context-menu" || !menuPosition) return null;
  return (
    <>
      <Menu
        className="context-menu asset-item-context-menu"
        open={menuPosition !== null}
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