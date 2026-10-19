import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { ContextMenu, Divider, ListSubheader } from "../ui_primitives";
import ContextMenuItem from "./ContextMenuItem";
import useContextMenuStore from "../../stores/ContextMenuStore";
import { Workflow } from "../../stores/ApiTypes";
import {
  useFavoriteWorkflowActions,
  useIsWorkflowFavorite
} from "../../stores/FavoriteWorkflowsStore";
import { useWorkflowActions } from "../../stores/WorkflowActionsStore";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import EditIcon from "@mui/icons-material/EditOutlined";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";

const WorkflowContextMenu: React.FC = () => {
  const { t } = useTranslation();
  const menuPosition = useContextMenuStore((state) => state.menuPosition);
  const closeContextMenu = useContextMenuStore((state) => state.closeContextMenu);
  const nodeId = useContextMenuStore((state) => state.nodeId);
  const payload = useContextMenuStore((state) => state.payload) as Workflow | null;

  const workflowId = nodeId || payload?.id;
  const isFavorite = useIsWorkflowFavorite(workflowId || "");
  const { toggleFavorite } = useFavoriteWorkflowActions();
  const { onEdit, onDuplicate, onDelete, onOpenAsApp } = useWorkflowActions();

  const handleEdit = useCallback(() => {
    if (payload && onEdit) {
      onEdit(payload);
    }
    closeContextMenu();
  }, [payload, onEdit, closeContextMenu]);

  const handleDuplicate = useCallback(
    (event?: React.MouseEvent) => {
      if (payload && onDuplicate) {
        onDuplicate(event as React.MouseEvent, payload);
      }
      closeContextMenu();
    },
    [payload, onDuplicate, closeContextMenu]
  );

  const handleDelete = useCallback(() => {
    if (payload && onDelete) {
      onDelete(payload);
    }
    closeContextMenu();
  }, [payload, onDelete, closeContextMenu]);

  const handleToggleFavorite = useCallback(() => {
    if (workflowId) {
      toggleFavorite(workflowId);
    }
    closeContextMenu();
  }, [workflowId, toggleFavorite, closeContextMenu]);

  const handleOpenAsApp = useCallback(() => {
    if (payload && onOpenAsApp) {
      onOpenAsApp(payload);
    }
    closeContextMenu();
  }, [payload, onOpenAsApp, closeContextMenu]);

  if (!menuPosition || !payload) {
    return null;
  }

  return (
    <ContextMenu
      className="context-menu workflow-context-menu"
      open={menuPosition !== null}
      onClose={closeContextMenu}
      onContextMenu={(event) => event.preventDefault()}
      position={menuPosition}
    >
      <ListSubheader>{payload.name}</ListSubheader>
      <ContextMenuItem
        onClick={handleToggleFavorite}
        label={isFavorite ? t("screen_editor.removeFromFavorites") : t("screen_editor.addToFavorites")}
        IconComponent={isFavorite ? <StarIcon /> : <StarBorderIcon />}
      />
      <ContextMenuItem onClick={handleEdit} label={t("screen_editor.edit")} IconComponent={<EditIcon />} />
      <ContextMenuItem
        onClick={handleDuplicate}
        label={t("screen_editor.duplicate")}
        IconComponent={<ContentCopyIcon />}
      />
      {onOpenAsApp && (
        <ContextMenuItem
          onClick={handleOpenAsApp}
          label={t("screen_editor.openAsApp")}
          IconComponent={<StarIcon />}
        />
      )}
      <Divider />
      <ContextMenuItem
        onClick={handleDelete}
        label={t("screen_editor.delete")}
        destructive
        IconComponent={<DeleteIcon />}
      />
    </ContextMenu>
  );
};

export default WorkflowContextMenu;
