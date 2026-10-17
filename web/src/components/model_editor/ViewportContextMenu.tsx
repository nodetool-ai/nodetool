import { memo } from "react";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CenterFocusStrongIcon from "@mui/icons-material/CenterFocusStrong";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";

import { ContextMenu, MenuItemPrimitive } from "../ui_primitives";
import { shortcutKeys, type EditorAction } from "./editorShortcuts";

const keys = (action: EditorAction): string => shortcutKeys(action).join("+");

interface ViewportContextMenuProps {
  /** Screen position of the right-click; null closes the menu. */
  position: { x: number; y: number } | null;
  onClose: () => void;
  onDuplicate: () => void;
  onFrame: () => void;
  onHide: () => void;
  onDelete: () => void;
}

/** Right-click menu for the object under the pointer in the 3D viewport. */
const ViewportContextMenu = ({
  position,
  onClose,
  onDuplicate,
  onFrame,
  onHide,
  onDelete
}: ViewportContextMenuProps) => {
  const run = (action: () => void) => () => {
    action();
    onClose();
  };
  return (
    <ContextMenu open={position !== null} position={position} onClose={onClose} minWidth={200}>
      <MenuItemPrimitive
        label="Duplicate"
        icon={<ContentCopyIcon fontSize="small" />}
        shortcut={keys("duplicate")}
        onClick={run(onDuplicate)}
      />
      <MenuItemPrimitive
        label="Frame selection"
        icon={<CenterFocusStrongIcon fontSize="small" />}
        shortcut={keys("focusSelection")}
        onClick={run(onFrame)}
      />
      <MenuItemPrimitive
        label="Hide"
        icon={<VisibilityOffIcon fontSize="small" />}
        shortcut={keys("hide")}
        onClick={run(onHide)}
      />
      <MenuItemPrimitive
        label="Delete"
        color="error"
        dividerBefore
        icon={<DeleteOutlineIcon fontSize="small" />}
        shortcut={keys("delete")}
        onClick={run(onDelete)}
      />
    </ContextMenu>
  );
};

export default memo(ViewportContextMenu);
