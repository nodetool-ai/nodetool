import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { ContextMenu, Divider, ListSubheader } from "../ui_primitives";
import ContextMenuItem from "./ContextMenuItem";
import useContextMenuStore from "../../stores/ContextMenuStore";
import {
  useSidebarDocumentActions,
  type SidebarDocumentItem
} from "../../stores/SidebarDocumentActionsStore";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import EditIcon from "@mui/icons-material/EditOutlined";

/**
 * Right-click menu for sidebar document list items (timelines, sketches,
 * skills). Mirrors WorkflowContextMenu, offering the actions that apply to
 * these documents: rename, duplicate, delete — Duplicate alone on a `readOnly`
 * row, which is the only one of the three a shipped document accepts.
 */
const SidebarDocumentContextMenu: React.FC = () => {
  const { t } = useTranslation();
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
      open
      onClose={closeContextMenu}
      onContextMenu={(event) => event.preventDefault()}
      position={menuPosition}
      disableRestoreFocus
    >
      <ListSubheader>{payload.name}</ListSubheader>
      {!payload.readOnly && (
        <ContextMenuItem
          onClick={handleRename}
          label={t("screen_editor.rename")}
          IconComponent={<EditIcon />}
        />
      )}
      <ContextMenuItem
        onClick={handleDuplicate}
        label={t("screen_editor.duplicate")}
        IconComponent={<ContentCopyIcon />}
      />
      {!payload.readOnly && <Divider />}
      {!payload.readOnly && (
        <ContextMenuItem
          onClick={handleDelete}
          label={t("screen_editor.delete")}
          destructive
          IconComponent={<DeleteIcon />}
        />
      )}
    </ContextMenu>
  );
};

export default SidebarDocumentContextMenu;
