/** @jsxImportSource @emotion/react */
import React, { memo, useCallback } from "react";
import { Box } from "@mui/material";
import { Workflow } from "../../stores/ApiTypes";
import { prettyDate, relativeTime } from "../../utils/formatDateAndTime";
import { truncateString } from "../../utils/truncateString";
import { DeleteButton, EditorButton, Text, Tooltip, FlexColumn } from "../ui_primitives";
import { useSettingsStore } from "../../stores/SettingsStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import isEqual from "lodash/isEqual";
import { sanitizeImageUrl } from "../../utils/urlValidation";
import { addBreaks } from "../../utils/sanitize";

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

  const handleDuplicate = useCallback(
    (event: React.MouseEvent) => {
      onDuplicateWorkflow(event, workflow);
    },
    [onDuplicateWorkflow, workflow]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      onDelete(e, workflow);
    },
    [onDelete, workflow]
  );

  return (
    <FlexColumn
      onDoubleClick={handleDoubleClick}
      onClick={handleClick}
      className={`workflow grid${isSelected ? " selected" : ""}`}
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

      <Text className="description">
        {truncateString(workflow.description, 150)}
      </Text>

      <Text className="date">
        {relativeTime(workflow.updated_at)} <br />
        {prettyDate(workflow.updated_at, "verbose", settings)}
      </Text>

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
              delay={TOOLTIP_ENTER_DELAY}
            >
              <EditorButton color="primary" onClick={handleDuplicate} density="compact">
                Duplicate
              </EditorButton>
            </Tooltip>

            <DeleteButton onClick={handleDelete} />
          </>
        )}
      </div>
    </FlexColumn>
  );
};

export default memo(WorkflowTile, isEqual);
