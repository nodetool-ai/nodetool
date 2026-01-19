/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Box, Typography, IconButton, Tooltip, Button } from "@mui/material";
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
  onRename: (workflow: Workflow, newName: string) => void;
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
  onRename,
  onOpenAsApp
}: WorkflowListItemProps) => {
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const setActions = useWorkflowActionsStore((state) => state.setActions);
  const clearActions = useWorkflowActionsStore((state) => state.clearActions);
  const showGraphPreview = useShowGraphPreview();
  const isFavorite = useIsWorkflowFavorite(workflow.id);
  const { toggleFavorite } = useFavoriteWorkflowActions();
  
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleOpen = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onOpenWorkflow(workflow);
    },
    [onOpenWorkflow, workflow]
  );

  const handleNameDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsEditing(true);
    },
    []
  );

  const handleNameChange = useCallback(
    (newName: string) => {
      if (newName.trim() && newName !== workflow.name) {
        onRename(workflow, newName.trim());
      }
      setIsEditing(false);
    },
    [onRename, workflow]
  );

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleNameChange(e.currentTarget.value);
      } else if (e.key === "Escape") {
        setIsEditing(false);
      }
    },
    [handleNameChange]
  );

  const handleNameBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      handleNameChange(e.target.value);
    },
    [handleNameChange]
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
      <Box sx={{ maxWidth: 300 }}>
        <Typography sx={{ fontSize: "var(--fontSizeNormal)", fontWeight: 500, mb: 0.5 }}>
          {workflow.name}
        </Typography>
        {hasDescription && (
          <Typography
          sx={{ fontSize: "var(--fontSizeSmall)",color: "grey.200", mb: hasTags ? 0.5 : 0 }}>
            {workflow.description}
          </Typography>
        )}
        {hasTags && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: "4px", mt: 2 }}>
            {workflow.tags!.map((tag) => (
              <Typography
                key={tag}
                sx={{
                  fontSize: "0.7rem",
                  color: "grey.900",
                  backgroundColor: "grey.200",
                  borderRadius: "1em",
                  padding: "0.15em 0.5em",
                  fontFamily: "var(--fontFamily2)"
                }}
              >
                {tag}
              </Typography>
            ))}
          </Box>
        )}
      </Box>
    );
  }, [workflow.name, workflow.description, workflow.tags]);

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
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            defaultValue={workflow.name}
            autoFocus
            onFocus={(e) => e.target.select()}
            onBlur={handleNameBlur}
            onKeyDown={handleNameKeyDown}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "transparent",
              border: "1px solid var(--palette-primary-main)",
              borderRadius: "4px",
              color: "inherit",
              padding: "4px 8px",
              fontSize: "inherit",
              fontWeight: 500,
              lineHeight: "2em",
              width: "calc(100% - 140px)",
              outline: "none"
            }}
          />
        ) : (
          <Typography 
            className="name"
            onDoubleClick={handleNameDoubleClick}
            title="Double-click to rename"
          >
            {workflow.name}
          </Typography>
        )}
      </Box>
      <Box className="date-container">
        {isFavorite && <StarIcon className="favorite-indicator" sx={{ fontSize: "0.85rem", color: "warning.main" }} />}
        <Typography className="date">{relativeTime(workflow.updated_at)}</Typography>
      </Box>
      <Box className="actions">
        <Button
          className="open-button"
          size="small"
          variant="contained"
          onClick={handleOpen}
          title="Open workflow"
          sx={{ 
            padding: "2px 10px",
            minWidth: "unset",
            fontSize: "0.7rem",
            fontWeight: 600,
            textTransform: "none",
            lineHeight: 1.4,
            borderRadius: "4px"
          }}
        >
          OPEN
        </Button>
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
