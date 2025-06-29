//mui
import { Menu, MenuItem, Typography, Divider } from "@mui/material";
import ContextMenuItem from "./ContextMenuItem";
//icons
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
//store
import useContextMenuStore from "../../stores/ContextMenuStore";
import { useAssetGridStore } from "../../stores/AssetGridStore";

const AssetGridContextMenu = () => {
  const currentFolder = useAssetGridStore((state) => state.currentFolder);
  const menuPosition = useContextMenuStore((state) => state.menuPosition);
  const closeContextMenu = useContextMenuStore(
    (state) => state.closeContextMenu
  );
  const setCreateFolderDialogOpen = useAssetGridStore(
    (state) => state.setCreateFolderDialogOpen
  );

  const handleCreateFolder = (e?: React.MouseEvent<HTMLElement>) => {
    e?.stopPropagation();
    setCreateFolderDialogOpen(true);
    closeContextMenu();
  };

  if (!menuPosition) return null;

  return (
    <Menu
      className="context-menu asset-grid-context-menu"
      open={menuPosition !== null}
      onContextMenu={(event) => event.preventDefault()}
      anchorReference="anchorPosition"
      onClose={closeContextMenu}
      style={{ padding: "1em" }}
      anchorPosition={
        menuPosition ? { top: menuPosition.y, left: menuPosition.x } : undefined
      }
    >
      <MenuItem disabled>
        <Typography variant="body1" className="title">
          Folder: {currentFolder?.name || "ASSETS"}
        </Typography>
      </MenuItem>
      <Divider />
      <ContextMenuItem
        onClick={handleCreateFolder}
        label="Create new folder"
        IconComponent={<CreateNewFolderIcon />}
        tooltip={`Create a new folder in '${currentFolder?.name || "ASSETS"}' `}
      />
    </Menu>
  );
};

export default AssetGridContextMenu;
