/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useEffect, useMemo } from "react";
import { Box, Typography, IconButton, Tooltip } from "@mui/material";
import Checkbox from "@mui/material/Checkbox";
import { Workflow } from "../../stores/ApiTypes";
import isEqual from "lodash/isEqual";
import { WorkflowMiniPreview } from "../version/WorkflowMiniPreview";
import useContextMenuStore from "../../stores/ContextMenuStore";
import { useWorkflowActionsStore } from "../../stores/WorkflowActionsStore";
import { useShowGraphPreview } from "../../stores/WorkflowListViewStore";
import { useIsWorkflowFavorite, useFavoriteWorkflowActions } from "../../stores/FavoriteWorkflowsStore";
import { relativeTime } from "../../utils/formatDateAndTime";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import EditIcon from "@mui/icons-material/Edit";

interface WorkflowListItemProps {
  workflow: Workflow;
  isSelected: boolean;
  isCurrent: boolean;
  isAlternate: boolean;
  showCheckboxes: boolean;
  onOpenWorkflow: (workflow: Workflow) => void;
  onDuplicateWorkflow: (event: React.MouseEvent, workflow: Workflow) => void;
  onSelect: (workflow: Workflow) => void;
  onDelete: (workflow: Workflow) => void;
  onEdit: (workflow: Workflow) => void;
  onOpenAsApp?: (workflow: Workflow) => void;
}

const WorkflowListItem: React.FC<WorkflowListItemProps> = ({
  workflow,
  isSelected,
  isCurrent,
  isAlternate,
  showCheckboxes,
  onOpenWorkflow,
  onDuplicateWorkflow,
  onSelect,
  onDelete,
  onEdit,
  onOpenAsApp
}: WorkflowListItemProps) => {
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const setActions = useWorkflowActionsStore((state) => state.setActions);
  const clearActions = useWorkflowActionsStore((state) => state.clearActions);
  const showGraphPreview = useShowGraphPreview();
  const isFavorite = useIsWorkflowFavorite(workflow.id);
  const { toggleFavorite } = useFavoriteWorkflowActions();

  const handleToggleFavorite = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFavorite(workflow.id);
    },
    [toggleFavorite, workflow.id]
  );

  const handleEdit = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onEdit(workflow);
    },
    [onEdit, workflow]
  );

  useEffect(() => {
    setActions({ onEdit, onDuplicate: onDuplicateWorkflow, onDelete, onOpenAsApp });
    return () => clearActions();
  }, [setActions, clearActions, onEdit, onDuplicateWorkflow, onDelete, onOpenAsApp]);

  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      openContextMenu(
        "workflow-context-menu",
        workflow.id,
        event.clientX,
        event.clientY,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        workflow
      );
    },
    [openContextMenu, workflow]
  );

  // Build tooltip content from description and tags
  const tooltipContent = useMemo(() => {
    const hasDescription = workflow.description && workflow.description.trim().length > 0;
    const hasTags = workflow.tags && workflow.tags.length > 0;
    
    if (!hasDescription && !hasTags) {
      return null;
    }
    
    return (
      <Box sx={{ fontSize: "0.75rem", maxWidth: 300 }}>
        {hasDescription && (
          <Typography sx={{ fontSize: "inherit", mb: hasTags ? 0.5 : 0 }}>
            {workflow.description}
          </Typography>
        )}
        {hasTags && (
          <Typography sx={{ fontSize: "inherit", fontStyle: "italic", color: "grey.400" }}>
            {workflow.tags!.join(", ")}
          </Typography>
        )}
      </Box>
    );
  }, [workflow.description, workflow.tags]);

  const workflowItem = (
    <Box
      key={workflow.id}
      className={
        "workflow list" +
        (isSelected ? " selected" : "") +
        (isCurrent ? " current" : "") +
        (isAlternate ? " alternate" : "") +
        (isFavorite ? " favorite" : "")
      }
      onContextMenu={handleContextMenu}
      onClick={(e) => {
        if (!e.defaultPrevented) {
          onOpenWorkflow(workflow);
        }
      }}
    >
      {showCheckboxes && (
        <Checkbox
          className="checkbox"
          size="small"
          checked={isSelected}
          onClick={(e) => {
            e.preventDefault();
            onSelect(workflow);
          }}
        />
      )}
      <Box className="preview-container" sx={{ flexGrow: 1, width: "100%", mr: 0 }}>
        {showGraphPreview && (
          <WorkflowMiniPreview
            workflow={workflow}
            width="100%"
            height={100}
            label={workflow.name}
          />
        )}
        <Typography className="name">
          {workflow.name}
        </Typography>
      </Box>
      <Box className="date-container">
        {isFavorite && <StarIcon className="favorite-indicator" sx={{ fontSize: "0.85rem", color: "warning.main" }} />}
        <Typography className="date">{relativeTime(workflow.updated_at)}</Typography>
      </Box>
      <Box className="actions">
        <IconButton
          className="favorite-button"
          size="small"
          onClick={handleToggleFavorite}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
          sx={{ padding: "4px" }}
        >
          {isFavorite ? <StarIcon sx={{ fontSize: "1rem", color: "warning.main" }} /> : <StarBorderIcon sx={{ fontSize: "1rem" }} />}
        </IconButton>
        <IconButton
          className="edit-button"
          size="small"
          onClick={handleEdit}
          title="Edit workflow settings"
          sx={{ padding: "4px" }}
        >
          <EditIcon sx={{ fontSize: "1rem" }} />
        </IconButton>
      </Box>
    </Box>
  );

  if (tooltipContent) {
    return (
      <Tooltip 
        title={tooltipContent} 
        placement="right" 
        arrow
        enterDelay={500}
        enterNextDelay={500}
      >
        {workflowItem}
      </Tooltip>
    );
  }

  return workflowItem;
};

export default memo(WorkflowListItem, isEqual);
