/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { Box, Button, Tooltip, Typography } from "@mui/material";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import { Workflow } from "../../stores/ApiTypes";
import { prettyDate, relativeTime } from "../../utils/formatDateAndTime";
import { truncateString } from "../../utils/truncateString";
import DeleteButton from "../buttons/DeleteButton";
import { useSettingsStore } from "../../stores/SettingsStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import isEqual from "lodash/isEqual";
import { escapeHtml } from "../../utils/highlightText";
import useFavoritesStore from "../../stores/FavoritesStore";

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
  const isFavorite = useFavoritesStore((state) => state.isFavorite(workflow.id));
  const toggleFavorite = useFavoritesStore((state) => state.toggleFavorite);

  const handleFavoriteClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    toggleFavorite(workflow.id);
  };

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
        <Tooltip
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
          placement="top"
          enterDelay={TOOLTIP_ENTER_DELAY}
        >
          <Box
            onClick={handleFavoriteClick}
            className="favorite-button"
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
              cursor: "pointer",
              color: isFavorite ? "#ffd700" : "rgba(255,255,255,0.7)",
              backgroundColor: "rgba(0,0,0,0.3)",
              borderRadius: "50%",
              padding: "4px",
              transition: "all 0.2s ease",
              "&:hover": {
                backgroundColor: "rgba(0,0,0,0.5)",
                transform: "scale(1.1)"
              }
            }}
          >
            {isFavorite ? (
              <StarIcon sx={{ fontSize: 20 }} />
            ) : (
              <StarBorderIcon sx={{ fontSize: 20 }} />
            )}
          </Box>
        </Tooltip>
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
