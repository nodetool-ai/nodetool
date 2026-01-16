/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { Box, Button, Tooltip, Typography } from "@mui/material";
import { Workflow } from "../../stores/ApiTypes";
import { prettyDate, relativeTime } from "../../utils/formatDateAndTime";
import { truncateString } from "../../utils/truncateString";
import DeleteButton from "../buttons/DeleteButton";
import { useSettingsStore } from "../../stores/SettingsStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import isEqual from "lodash/isEqual";

interface WorkflowTileProps {
  workflow: Workflow;
  isSelected: boolean;
  workflowCategory: string;
  onClickOpen: (workflow: Workflow) => void;
  onDoubleClickWorkflow: (workflow: Workflow) => void;
  onDuplicateWorkflow: (event: React.MouseEvent, workflow: Workflow) => void;
  onSelect: (workflow: Workflow) => void;
  onDelete: (e: any, workflow: Workflow) => void;
}

export const WorkflowTile = ({
  workflow,
  isSelected,
  workflowCategory,
  onClickOpen,
  onDoubleClickWorkflow,
  onDuplicateWorkflow,
  onSelect,
  onDelete
}: WorkflowTileProps) => {
  const settings = useSettingsStore((state) => state.settings);

  return (
    <Box
      onDoubleClick={() => onDoubleClickWorkflow(workflow)}
      onClick={() => onSelect(workflow)}
      className={`workflow grid${isSelected ? " selected" : ""}`}
      sx={{ display: "flex", flexDirection: "column" }}
    >
      <Box
        className="image-wrapper"
        sx={{
          backgroundSize: "cover",
          backgroundPosition: "center top",
          backgroundImage: workflow.thumbnail_url
            ? `url(${workflow.thumbnail_url})`
            : "none",
          width: "200px",
          height: "200px"
        }}
      >
        {!workflow.thumbnail_url && <Box className="image-placeholder" />}
      </Box>

      <Box className="name" sx={{ wordBreak: "break-word" }}>
        {workflow.name}
      </Box>

      <Typography className="description">
        {truncateString(workflow.description, 150)}
      </Typography>

      <Typography className="date">
        {relativeTime(workflow.updated_at)} <br />
        {prettyDate(workflow.updated_at, "verbose", settings)}
      </Typography>

      <div className="actions">
        <Button
          size="small"
          className="open-button"
          color="primary"
          onClick={() => onClickOpen(workflow)}
        >
          Open
        </Button>
        {workflowCategory === "user" && (
          <>
            <Tooltip
              title="Make a copy of this workflow"
              placement="top"
              enterDelay={TOOLTIP_ENTER_DELAY}
            >
              <Button
                size="small"
                color="primary"
                onClick={(event) => onDuplicateWorkflow(event, workflow)}
              >
                Duplicate
              </Button>
            </Tooltip>

            <DeleteButton<Workflow> item={workflow} onClick={onDelete} />
          </>
        )}
      </div>
    </Box>
  );
};

export default memo(WorkflowTile, isEqual);
