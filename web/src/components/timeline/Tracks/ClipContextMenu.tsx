import React from "react";
import { ContextMenu, MenuItemPrimitive } from "../../ui_primitives";

interface ClipContextMenuProps {
  position: { x: number; y: number };
  isLinked: boolean;
  onUnlink: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * Right-click menu for a timeline clip. "Delete" is always available (so a
 * leftover failed/"generating" clip can be removed); "Unlink" is shown only
 * for clips that belong to a link group (e.g. a video and its extracted audio).
 */
export function ClipContextMenu({
  position,
  isLinked,
  onUnlink,
  onDelete,
  onClose
}: ClipContextMenuProps) {
  return (
    <ContextMenu open position={position} onClose={onClose} compact>
      {isLinked && (
        <MenuItemPrimitive
          label="Unlink"
          compact
          onClick={() => {
            onUnlink();
            onClose();
          }}
        />
      )}
      <MenuItemPrimitive
        label="Delete"
        compact
        onClick={() => {
          onDelete();
          onClose();
        }}
      />
    </ContextMenu>
  );
}
