import React, { useCallback } from "react";

import { Text, ContextMenu, MenuItem } from "../ui_primitives";
import ContextMenuItem from "./ContextMenuItem";
import useContextMenuStore from "../../stores/ContextMenuStore";
import {
  useSidebarDocumentActions,
  type SidebarDocumentItem
} from "../../stores/SidebarDocumentActionsStore";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";

/**
 * Right-click menu for sidebar document list items (timelines and sketches).
 * Mirrors WorkflowContextMenu, offering the actions that apply to these
 * documents: rename, duplicate, delete.
 */
const SidebarDocumentContextMenu: React.FC = () => {
  const menuPosition = useContextMenuStore((state) => state.menuPosition);
  const closeContextMenu = useContextMenuStore(
    (state) => state.closeContextMenu
  );
  const payload = useContextMenuStore(
    (state) => state.payload
  ) as SidebarDocumentItem | null;

  const { onRename, onDuplicate, onDelete } = useSidebarDocumentActions();

  const handleRename = useCallback(() => {
    if (payload && onRename) {
      onRename(payload);
    }
    closeContextMenu();
  }, [payload, onRename, closeContextMenu]);

  const handleDuplicate = useCallback(() => {
    if (payload && onDuplicate) {
      onDuplicate(payload);
    }
    closeContextMenu();
  }, [payload, onDuplicate, closeContextMenu]);

  const handleDelete = useCallback(() => {
    if (payload && onDelete) {
      onDelete(payload);
    }
    closeContextMenu();
  }, [payload, onDelete, closeContextMenu]);

  if (!menuPosition || !payload) {
    return null;
  }

  return (
    <ContextMenu
      className="context-menu sidebar-document-context-menu"
      open={menuPosition !== null}
      onClose={closeContextMenu}
      onContextMenu={(event) => event.preventDefault()}
      position={menuPosition}
    >
      <MenuItem disabled>
        <Text>{payload.name}</Text>
      </MenuItem>
      <ContextMenuItem
        onClick={handleRename}
        label="Rename"
        IconComponent={<EditIcon />}
      />
      <ContextMenuItem
        onClick={handleDuplicate}
        label="Duplicate"
        IconComponent={<ContentCopyIcon />}
      />
      <ContextMenuItem
        onClick={handleDelete}
        label="Delete"
        addButtonClassName="delete"
        IconComponent={<DeleteIcon />}
      />
    </ContextMenu>
  );
};

export default SidebarDocumentContextMenu;
