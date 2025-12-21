//mui
import type { MouseEvent } from "react";
import { Menu, MenuItem, Typography, Divider } from "@mui/material";
import ContextMenuItem from "./ContextMenuItem";
//icons
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import SortByAlphaIcon from "@mui/icons-material/SortByAlpha";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import StorageIcon from "@mui/icons-material/Storage";
//store
import useContextMenuStore from "../../stores/ContextMenuStore";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useSettingsStore } from "../../stores/SettingsStore";

const AssetGridContextMenu = () => {
  const currentFolder = useAssetGridStore((state) => state.currentFolder);
  const menuPosition = useContextMenuStore((state) => state.menuPosition);
  const closeContextMenu = useContextMenuStore(
    (state) => state.closeContextMenu
  );
  const setCreateFolderDialogOpen = useAssetGridStore(
    (state) => state.setCreateFolderDialogOpen
  );
  const { settings, setAssetsOrder } = useSettingsStore((state) => ({
    settings: state.settings,
    setAssetsOrder: state.setAssetsOrder
  }));

  const withMenuClose =
    (action: () => void) =>
    (event?: MouseEvent<HTMLElement>) => {
      event?.stopPropagation();
      action();
      closeContextMenu();
    };

  const handleCreateFolder = withMenuClose(() => setCreateFolderDialogOpen(true));
  const handleSortByName = withMenuClose(() => setAssetsOrder("name"));
  const handleSortByDate = withMenuClose(() => setAssetsOrder("date"));
  const handleSortBySize = withMenuClose(() => setAssetsOrder("size"));

  if (!menuPosition) {return null;}

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
      <Divider />
      <ContextMenuItem
        onClick={handleSortByName}
        label={`Sort by name ${settings.assetsOrder === "name" ? "✓" : ""}`}
        IconComponent={<SortByAlphaIcon />}
        tooltip="Sort assets by name"
      />
      <ContextMenuItem
        onClick={handleSortByDate}
        label={`Sort by date ${settings.assetsOrder === "date" ? "✓" : ""}`}
        IconComponent={<AccessTimeIcon />}
        tooltip="Sort assets by creation date"
      />
      <ContextMenuItem
        onClick={handleSortBySize}
        label={`Sort by size ${settings.assetsOrder === "size" ? "✓" : ""}`}
        IconComponent={<StorageIcon />}
        tooltip="Sort assets by file size"
      />
    </Menu>
  );
};

export default AssetGridContextMenu;
