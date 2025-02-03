/** @jsxImportSource @emotion/react */
import React from "react";
import { Box, Button, Typography } from "@mui/material";
import Checkbox from "@mui/material/Checkbox";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteIcon from "@mui/icons-material/Delete";
import { Workflow } from "../../stores/ApiTypes";
import { relativeTime } from "../../utils/formatDateAndTime";

interface WorkflowListItemProps {
  workflow: Workflow;
  isSelected: boolean;
  isCurrent: boolean;
  showCheckboxes: boolean;
  panelSize: number;
  onOpenWorkflow: (workflow: Workflow) => void;
  onDuplicateWorkflow: (event: React.MouseEvent, workflow: Workflow) => void;
  onSelect: (workflow: Workflow) => void;
  onDelete: (workflow: Workflow) => void;
}

export const WorkflowListItem = React.memo(
  ({
    workflow,
    isSelected,
    isCurrent,
    showCheckboxes,
    panelSize,
    onOpenWorkflow,
    onDuplicateWorkflow,
    onSelect,
    onDelete
  }: WorkflowListItemProps) => {
    const addBreaks = (text: string) => {
      return text.replace(/([-_.])/g, "$1<wbr>");
    };

    return (
      <Box
        key={workflow.id}
        className={
          "workflow list" +
          (isSelected ? " selected" : "") +
          (isCurrent ? " current" : "")
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
        <div
          className="name"
          dangerouslySetInnerHTML={{ __html: addBreaks(workflow.name) }}
        ></div>
        <div className="actions">
          {panelSize >= 400 && (
            <Typography
              className="date"
              data-microtip-position="top"
              aria-label="Last modified"
              role="tooltip"
            >
              {relativeTime(workflow.updated_at)} <br />
            </Typography>
          )}
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
  }
);
