import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import {
  ContextMenu,
  ListSubheader,
  MenuItemPrimitive
} from "../ui_primitives";
import SortByAlphaIcon from "@mui/icons-material/SortByAlpha";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import StorageIcon from "@mui/icons-material/Storage";
import useContextMenuStore from "../../stores/ContextMenuStore";
import { useSettingsStore } from "../../stores/SettingsStore";

const AssetGridContextMenu = () => {
  const { t } = useTranslation();
  const menuPosition = useContextMenuStore((state) => state.menuPosition);
  const closeContextMenu = useContextMenuStore(
    (state) => state.closeContextMenu
  );
  const assetsOrder = useSettingsStore((state) => state.settings.assetsOrder);
  const setAssetsOrder = useSettingsStore((state) => state.setAssetsOrder);

  const withMenuClose =
    (action: () => void) =>
    (event?: MouseEvent) => {
      event?.stopPropagation();
      action();
      closeContextMenu();
    };

  const handleSortByName = withMenuClose(() => setAssetsOrder("name"));
  const handleSortByDate = withMenuClose(() => setAssetsOrder("date"));
  const handleSortBySize = withMenuClose(() => setAssetsOrder("size"));

  if (!menuPosition) {return null;}

  return (
    <ContextMenu
      className="context-menu asset-grid-context-menu"
      open={menuPosition !== null}
      onContextMenu={(event) => event.preventDefault()}
      onClose={closeContextMenu}
      position={menuPosition}
    >
      <ListSubheader className="title">
        {t("screen_editor.assets")}
      </ListSubheader>
      <MenuItemPrimitive
        onClick={handleSortByName}
        label={t("screen_editor.sortByName")}
        selected={assetsOrder === "name"}
        icon={<SortByAlphaIcon />}
        tooltip={t("screen_editor.sortAssetsByName")}
      />
      <MenuItemPrimitive
        onClick={handleSortByDate}
        label={t("screen_editor.sortByDate")}
        selected={assetsOrder === "date"}
        icon={<AccessTimeIcon />}
        tooltip={t("screen_editor.sortAssetsByDate")}
      />
      <MenuItemPrimitive
        onClick={handleSortBySize}
        label={t("screen_editor.sortBySize")}
        selected={assetsOrder === "size"}
        icon={<StorageIcon />}
        tooltip={t("screen_editor.sortAssetsBySize")}
      />
    </ContextMenu>
  );
};

export default AssetGridContextMenu;
