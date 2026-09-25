/**
 * The board toolbar's overflow: the actions a creator reaches for now and
 * then (restyling the board, exporting it, handing its media to a workflow).
 * Keeping them behind one button leaves the toolbar to the steps of making
 * the film: add shots, preview, settings, render.
 */

import React, { memo, useCallback, useState } from "react";
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
        tooltip="More board actions"
        ariaLabel="More board actions"
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
        slotProps={{ list: { "aria-label": "Board actions" } }}
      >
        <MenuItemPrimitive
          compact
          label="Change style…"
          icon={<PaletteOutlinedIcon fontSize="small" />}
          onClick={changeStyle}
        />
        <MenuItemPrimitive
          compact
          label={downloading ? "Preparing ZIP…" : "Download ZIP"}
          icon={<DownloadIcon fontSize="small" />}
          disabled={!hasShots || downloading}
          onClick={downloadZip}
        />
        {!inStudio && (
          <MenuItemPrimitive
            compact
            label="Send to workflow…"
            secondary={
              workflowMedia.length === 0
                ? "Render a still or clip first"
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
