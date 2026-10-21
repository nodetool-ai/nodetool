import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";

import { ContextMenu, MenuItemPrimitive, ToolbarIconButton } from "../../ui_primitives";
import type { GameExportTarget } from "../../../utils/gameExportZip";

interface GameExportButtonProps {
  readonly exporting: boolean;
  readonly onExport: (target: GameExportTarget) => void;
  /** Compiles a desktop executable on this computer. The entry is hidden without it. */
  readonly onBuildExecutable?: () => void;
}

/** Toolbar menu that downloads the published revision as a web player, a desktop app project or a mobile app project, or compiles it. */
export default function GameExportButton({ exporting, onExport, onBuildExecutable }: GameExportButtonProps): ReactNode {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const choose = (target: GameExportTarget): void => { setAnchor(null); onExport(target); };
  return <>
    <ToolbarIconButton icon={<ArchiveOutlinedIcon fontSize="small" />} tooltip={exporting ? t("screen_game.export.exportingBuild") : t("screen_game.export.exportBuild")}
      aria-haspopup="menu" aria-expanded={anchor !== null} disabled={exporting} onClick={(event) => setAnchor(event.currentTarget)} />
    <ContextMenu open={anchor !== null} anchorEl={anchor} onClose={() => setAnchor(null)}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
      <MenuItemPrimitive label={t("screen_game.export.webPlayer")} secondary={t("screen_game.export.webPlayerDescription")} onClick={() => choose("web")} />
      <MenuItemPrimitive label={t("screen_game.export.desktopApp")} secondary={t("screen_game.export.desktopAppDescription")} onClick={() => choose("tauri")} />
      <MenuItemPrimitive label={t("screen_game.export.mobileApp")} secondary={t("screen_game.export.mobileAppDescription")} onClick={() => choose("expo")} />
      {onBuildExecutable && <MenuItemPrimitive label={t("screen_game.export.desktopExecutable")} secondary={t("screen_game.export.desktopExecutableDescription")}
        onClick={() => { setAnchor(null); onBuildExecutable(); }} />}
    </ContextMenu>
  </>;
}
