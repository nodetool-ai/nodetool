/**
 * The board toolbar's overflow: the actions a creator reaches for now and
 * then (restyling the board, exporting it, handing its media to a workflow).
 * Keeping them behind one button leaves the toolbar to the steps of making
 * the film: add shots, preview, settings, render.
 */

import React, { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import DownloadIcon from "@mui/icons-material/Download";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PaletteOutlinedIcon from "@mui/icons-material/PaletteOutlined";

import { useInStudio } from "../../studio/StudioContext";
import { SendToWorkflowMenu } from "../workflows/SendToWorkflowMenu";
import {
  EditorMenu,
  MenuItemPrimitive,
  ToolbarIconButton
} from "../ui_primitives";
import type { WorkflowMediaItem } from "../../hooks/handlers/useGenerationToCanvas";

interface BoardActionsMenuProps {
  onChangeStyle: () => void;
  onDownloadZip: () => void;
  /** True while the archive is being packed; the item waits for it. */
  downloading: boolean;
  hasShots: boolean;
  /** Every still and clip on the board, for "Send to workflow". */
  workflowMedia: readonly WorkflowMediaItem[];
}

const BoardActionsMenu: React.FC<BoardActionsMenuProps> = ({
  onChangeStyle,
  onDownloadZip,
  downloading,
  hasShots,
  workflowMedia
}) => {
  const { t } = useTranslation();
  const inStudio = useInStudio();
  const [button, setButton] = useState<HTMLButtonElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const closeSend = useCallback(() => setSendOpen(false), []);
  const changeStyle = useCallback(() => {
    setMenuOpen(false);
    onChangeStyle();
  }, [onChangeStyle]);
  const downloadZip = useCallback(() => {
    setMenuOpen(false);
    onDownloadZip();
  }, [onDownloadZip]);
  const openSend = useCallback(() => {
    setMenuOpen(false);
    setSendOpen(true);
  }, []);

  return (
    <>
      <ToolbarIconButton
        ref={setButton}
        icon={<MoreVertIcon fontSize="small" />}
        tooltip={t("screens4_11.storyboard.boardActions.moreActions")}
        ariaLabel={t("screens4_11.storyboard.boardActions.moreActions")}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={openMenu}
      />
      <EditorMenu
        anchorEl={button}
        open={menuOpen}
        onClose={closeMenu}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          list: { "aria-label": t("screens4_11.storyboard.boardActions.menuLabel") }
        }}
      >
        <MenuItemPrimitive
          label={t("screens4_11.storyboard.boardActions.changeStyle")}
          icon={<PaletteOutlinedIcon fontSize="small" />}
          onClick={changeStyle}
        />
        <MenuItemPrimitive
          label={
            downloading
              ? t("screens4_11.storyboard.boardActions.preparingZip")
              : t("screens4_11.storyboard.boardActions.downloadZip")
          }
          icon={<DownloadIcon fontSize="small" />}
          disabled={!hasShots || downloading}
          onClick={downloadZip}
        />
        {!inStudio && (
          <MenuItemPrimitive
            label={t("screens4_11.storyboard.boardActions.sendToWorkflow")}
            secondary={
              workflowMedia.length === 0
                ? t("screens4_11.storyboard.boardActions.renderBeforeSend")
                : undefined
            }
            icon={<AccountTreeOutlinedIcon fontSize="small" />}
            disabled={workflowMedia.length === 0}
            onClick={openSend}
          />
        )}
      </EditorMenu>
      {sendOpen && (
        <SendToWorkflowMenu
          items={workflowMedia}
          anchorEl={button}
          onClose={closeSend}
        />
      )}
    </>
  );
};

export default memo(BoardActionsMenu);
