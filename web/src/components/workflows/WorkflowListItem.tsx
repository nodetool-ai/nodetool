/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { Box, Button, Typography } from "@mui/material";
import Checkbox from "@mui/material/Checkbox";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import LaunchIcon from "@mui/icons-material/Launch";
import { Workflow } from "../../stores/ApiTypes";
import { relativeTime } from "../../utils/formatDateAndTime";
import isEqual from "lodash/isEqual";
import { escapeHtml } from "../../utils/highlightText";
import { useFavoriteWorkflowsStore } from "../../stores/FavoriteWorkflowsStore";
import { useTheme } from "@mui/material/styles";

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
  onEdit
}: WorkflowListItemProps) => {
  const theme = useTheme();
  const { favoriteWorkflowIds, toggleFavorite } = useFavoriteWorkflowsStore();
  const isFavorite = favoriteWorkflowIds.has(workflow.id);

  const addBreaks = (text: string) => {
    return escapeHtml(text).replace(/([-_.])/g, "$1<wbr>");
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite(workflow.id);
  };

  return (
    <Box
      key={workflow.id}
      className={
        "workflow list" +
        (isSelected ? " selected" : "") +
        (isCurrent ? " current" : "") +
        (isAlternate ? " alternate" : "")
      }
      onContextMenu={(e) => {
        e.preventDefault();
      }}
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
      <Button
        size="small"
        className="favorite-button"
        onClick={handleFavoriteClick}
        data-microtip-position="bottom"
        aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        role="tooltip"
        sx={{
          minWidth: "32px",
          padding: "4px",
          "&:hover": {
            backgroundColor: "transparent"
          }
        }}
      >
        <Box
          component="span"
          sx={{
            color: isFavorite
              ? "var(--palette-primary-main)"
              : theme.vars.palette.grey[500],
            fontSize: "1.1rem",
            transition: "color 0.2s ease-in-out"
          }}
        >
          {isFavorite ? "★" : "☆"}
        </Box>
      </Button>
      <div
        className="name"
        dangerouslySetInnerHTML={{ __html: addBreaks(workflow.name) }}
      ></div>
      <div className="date">
        <Typography
          data-microtip-position="top"
          aria-label="Last modified"
          role="tooltip"
        >
          {relativeTime(workflow.updated_at)} <br />
        </Typography>
      </div>
      <div className="actions">
        <Button
          size="small"
          className="edit-button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onEdit(workflow);
          }}
          data-microtip-position="bottom"
          aria-label="Edit"
          role="tooltip"
        >
          <EditIcon />
        </Button>
        <Button
          size="small"
          className="duplicate-button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDuplicateWorkflow(event, workflow);
          }}
          data-microtip-position="bottom"
          aria-label="Duplicate"
          role="tooltip"
        >
          <ContentCopyIcon />
        </Button>

        <Button
          size="small"
          className="delete-button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDelete(workflow);
          }}
        >
          <DeleteIcon />
        </Button>
      </div>
    </Box>
  );
};

export default memo(WorkflowListItem, isEqual);
