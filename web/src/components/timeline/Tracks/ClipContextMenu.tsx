import React from "react";
import ContentCutOutlinedIcon from "@mui/icons-material/ContentCutOutlined";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import AutoAwesomeMotionIcon from "@mui/icons-material/AutoAwesomeMotion";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import ImageIcon from "@mui/icons-material/Image";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";

import { ContextMenu, MenuItemPrimitive } from "../../ui_primitives";
import {
  useClipMenuActions,
  type ClipMenuActionCallbacks
} from "./useClipMenuActions";

interface ClipContextMenuProps extends ClipMenuActionCallbacks {
  clipId: string;
  position: { x: number; y: number };
  isLinked: boolean;
  onUnlink: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * Right-click menu for a timeline clip — the single home for clip operations
 * (the inspector no longer carries a button row). "Delete" is always
 * available so a leftover failed/"generating" clip can be removed; "Unlink"
 * shows only for clips in a link group (e.g. a video and its extracted audio).
 */
export function ClipContextMenu({
  clipId,
  position,
  isLinked,
  onUnlink,
  onDelete,
  onClose,
  onRequestReplace,
  onError
}: ClipContextMenuProps) {
  const actions = useClipMenuActions(clipId, { onRequestReplace, onError });

  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <ContextMenu open position={position} onClose={onClose} compact>
      <MenuItemPrimitive
        label="Split at playhead"
        icon={<ContentCutOutlinedIcon fontSize="small" />}
        compact
        onClick={run(actions.splitAtPlayhead)}
      />
      <MenuItemPrimitive
        label="Duplicate"
        icon={<ContentCopyIcon fontSize="small" />}
        compact
        onClick={run(actions.duplicate)}
      />
      {actions.isGenerated && (
        <MenuItemPrimitive
          label="Regenerate as new clip"
          icon={<AutoAwesomeMotionIcon fontSize="small" />}
          compact
          onClick={run(actions.regenerateAsCopy)}
        />
      )}
      <MenuItemPrimitive
        label={actions.locked ? "Unlock" : "Lock"}
        icon={
          actions.locked ? (
            <LockIcon fontSize="small" />
          ) : (
            <LockOpenIcon fontSize="small" />
          )
        }
        compact
        onClick={run(actions.toggleLock)}
      />
      <MenuItemPrimitive
        label="Replace clip…"
        icon={<ImageIcon fontSize="small" />}
        compact
        onClick={run(actions.openReplace)}
      />
      {actions.canOpenInNodeEditor && (
        <MenuItemPrimitive
          label="Open in node editor"
          icon={<OpenInNewIcon fontSize="small" />}
          compact
          onClick={run(actions.openInNodeEditor)}
        />
      )}
      {isLinked && (
        <MenuItemPrimitive
          label="Unlink"
          icon={<LinkOffIcon fontSize="small" />}
          compact
          onClick={run(onUnlink)}
        />
      )}
      <MenuItemPrimitive
        label="Delete"
        icon={<DeleteOutlineOutlinedIcon fontSize="small" />}
        compact
        onClick={run(onDelete)}
      />
    </ContextMenu>
  );
}
