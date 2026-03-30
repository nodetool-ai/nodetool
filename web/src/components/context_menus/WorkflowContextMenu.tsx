import React, { useCallback } from "react";
import { Menu, Typography, MenuItem } from "@mui/material";
import ContextMenuItem from "./ContextMenuItem";
import useContextMenuStore from "../../stores/ContextMenuStore";
import { Workflow } from "../../stores/ApiTypes";
import {
  useFavoriteWorkflowActions,
  useIsWorkflowFavorite
} from "../../stores/FavoriteWorkflowsStore";
import { useWorkflowActions } from "../../stores/WorkflowActionsStore";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";

const WorkflowContextMenu: React.FC = () => {
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
    <Menu
      className="context-menu workflow-context-menu"
      open={menuPosition !== null}
      onClose={closeContextMenu}
      onContextMenu={(event) => event.preventDefault()}
      anchorReference="anchorPosition"
      anchorPosition={
        menuPosition ? { top: menuPosition.y, left: menuPosition.x } : undefined
      }
    >
      <MenuItem disabled>
        <Typography variant="body1">{payload.name}</Typography>
      </MenuItem>
      <ContextMenuItem
        onClick={handleToggleFavorite}
        label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        IconComponent={isFavorite ? <StarIcon /> : <StarBorderIcon />}
      />
      <ContextMenuItem onClick={handleEdit} label="Edit" IconComponent={<EditIcon />} />
      <ContextMenuItem
        onClick={handleDuplicate}
        label="Duplicate"
        IconComponent={<ContentCopyIcon />}
      />
      {onOpenAsApp && (
        <ContextMenuItem
          onClick={handleOpenAsApp}
          label="Open as App"
          IconComponent={<StarIcon />}
        />
      )}
      <ContextMenuItem
        onClick={handleDelete}
        label="Delete"
        addButtonClassName="delete"
        IconComponent={<DeleteIcon />}
      />
    </Menu>
  );
};

export default WorkflowContextMenu;
