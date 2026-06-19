import React from "react";
import { ContextMenu, MenuItemPrimitive } from "../../ui_primitives";

interface ClipContextMenuProps {
  position: { x: number; y: number };
  isLinked: boolean;
  onUnlink: () => void;
  onClose: () => void;
}

/**
 * Minimal right-click menu for a timeline clip. Currently exposes "Unlink"
 * for clips that belong to a link group (e.g. a video and its extracted audio).
 */
export function ClipContextMenu({
  position,
  isLinked,
  onUnlink,
  onClose
}: ClipContextMenuProps) {
  if (!isLinked) {
    return null;
  }
  return (
    <ContextMenu open position={position} onClose={onClose} compact>
      <MenuItemPrimitive
        label="Unlink"
        compact
        onClick={() => {
          onUnlink();
          onClose();
        }}
      />
    </ContextMenu>
  );
}
