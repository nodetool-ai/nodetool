/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { Box, Button, Typography } from "@mui/material";
import Checkbox from "@mui/material/Checkbox";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import { Workflow } from "../../stores/ApiTypes";
import isEqual from "lodash/isEqual";
import { WorkflowMiniPreview } from "../version/WorkflowMiniPreview";

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
      <Box className="preview-container" sx={{ flexGrow: 1, width: "100%", mr: 0 }}>
        <WorkflowMiniPreview
          workflow={workflow}
          width="100%"
          height={100}
          label={workflow.name}
        />
        <Typography className="name">
          {workflow.name}
        </Typography>
      </Box>
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
