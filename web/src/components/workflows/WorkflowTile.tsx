/** @jsxImportSource @emotion/react */
import React, { memo, useCallback } from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import { Workflow } from "../../stores/ApiTypes";
import { prettyDate, relativeTime } from "../../utils/formatDateAndTime";
import { truncateString } from "../../utils/truncateString";
import { DeleteButton, EditorButton } from "../ui_primitives";
import { useSettingsStore } from "../../stores/SettingsStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import isEqual from "lodash/isEqual";
import { escapeHtml } from "../../utils/highlightText";
import { sanitizeImageUrl } from "../../utils/urlValidation";

interface WorkflowTileProps {
  workflow: Workflow;
  isSelected: boolean;
  workflowCategory: string;
  onClickOpen: (workflow: Workflow) => void;
  onDoubleClickWorkflow: (workflow: Workflow) => void;
  onDuplicateWorkflow: (event: React.MouseEvent, workflow: Workflow) => void;
  onSelect: (workflow: Workflow) => void;
  onDelete: (e: React.MouseEvent, workflow: Workflow) => void;
}

const addBreaks = (text: string) => {
  return escapeHtml(text).replace(/([-_.])/g, "$1<wbr>");
};

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

  const handleDoubleClick = useCallback(() => {
    onDoubleClickWorkflow(workflow);
  }, [onDoubleClickWorkflow, workflow]);

  const handleClick = useCallback(() => {
    onSelect(workflow);
  }, [onSelect, workflow]);

  const handleOpenClick = useCallback(() => {
    onClickOpen(workflow);
  }, [onClickOpen, workflow]);

  return (
    <Box
      onDoubleClick={handleDoubleClick}
      onClick={handleClick}
      className={`workflow grid${isSelected ? " selected" : ""}`}
      sx={{ display: "flex", flexDirection: "column" }}
    >
      <Box
        className="image-wrapper"
        sx={{
          backgroundSize: "cover",
          backgroundPosition: "center top",
          backgroundImage: sanitizeImageUrl(workflow.thumbnail_url)
            ? `url(${sanitizeImageUrl(workflow.thumbnail_url)})`
            : "none",
          width: "200px",
          height: "200px"
        }}
      >
        {!workflow.thumbnail_url && <Box className="image-placeholder" />}
      </Box>

      <div
        className="name"
        dangerouslySetInnerHTML={{ __html: addBreaks(workflow.name) }}
      />

      <Typography className="description">
        {truncateString(workflow.description, 150)}
      </Typography>

      <Typography className="date">
        {relativeTime(workflow.updated_at)} <br />
        {prettyDate(workflow.updated_at, "verbose", settings)}
      </Typography>

      <div className="actions">
        <EditorButton
          className="open-button"
          color="primary"
          onClick={handleOpenClick}
          density="compact"
        >
          Open
        </EditorButton>
        {workflowCategory === "user" && (
          <>
            <Tooltip
              title="Make a copy of this workflow"
              placement="top"
              enterDelay={TOOLTIP_ENTER_DELAY}
            >
              <EditorButton
                color="primary"
                onClick={(event) => onDuplicateWorkflow(event, workflow)}
                density="compact"
              >
                Duplicate
              </EditorButton>
            </Tooltip>

            <DeleteButton onClick={(e) => onDelete(e, workflow)} />
          </>
        )}
      </div>
    </Box>
  );
};

export default memo(WorkflowTile, isEqual);
