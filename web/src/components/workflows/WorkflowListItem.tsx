/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Box, Typography, Tooltip } from "@mui/material";
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
import { TOOLTIP_ENTER_DELAY, TOOLTIP_ENTER_NEXT_DELAY } from "../../config/constants";
import { FavoriteButton, EditButton, EditorButton, FlexColumn, FlexRow, Text } from "../ui_primitives";

interface WorkflowListItemProps {
  workflow: Workflow;
  isSelected: boolean;
  isCurrent: boolean;
  isAlternate: boolean;
  showCheckboxes: boolean;
  hideDate?: boolean;
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
  hideDate = false,
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
    (_isFavorite: boolean) => {
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

  const handleCheckboxClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onSelect(workflow);
    },
    [onSelect, workflow]
  );

  const handleInputFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  }, []);

  const handleInputClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const inputStyle = useMemo(
    () => ({
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
    }),
    []
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

  // Build tooltip content from description, tags, and graph preview (only in list mode)
  const tooltipContent = useMemo(() => {
    const hasDescription = workflow.description && workflow.description.trim().length > 0;
    const hasTags = workflow.tags && workflow.tags.length > 0;
    // Only show graph in tooltip when not in preview mode (avoid duplication)
    const hasGraph = !showGraphPreview && workflow.graph && (workflow.graph.nodes?.length > 0 || workflow.graph.edges?.length > 0);

    return (
      <FlexColumn gap={1} sx={{ width: hasGraph ? 320 : "auto", maxWidth: 320, padding: "1em" }}>
        <Text size="normal" weight={500}>
          {workflow.name}
        </Text>
        {hasDescription && (
          <Text size="small" color="secondary" sx={{ mt: 1 }}>
            {workflow.description}
          </Text>
        )}
        {hasTags && (
          <FlexRow gap={0.5} sx={{ flexWrap: "wrap", mt: 1 }}>
            {workflow.tags?.map((tag) => (
              <Typography
                key={tag}
                sx={{
                  fontSize: "0.7rem",
                  color: "grey.900",
                  backgroundColor: "grey.200",
                  borderRadius: "1em",
                  padding: "0.15em 0.5em",
                  margin: "0.75em 0",
                  fontWeight: 600,
                  fontFamily: "var(--fontFamily2)"
                }}
              >
                {tag}
              </Typography>
            ))}
          </FlexRow>
        )}
        {hasGraph && (
          <Box sx={{ 
            mt: 1,
            "& .MuiPaper-root": {
              border: "none",
              borderRadius: 0
            }
          }}>
            <WorkflowMiniPreview
              workflow={workflow}
              width={320}
              height={130}
            />
          </Box>
        )}
      </FlexColumn>
    );
  }, [workflow, showGraphPreview]);

  const workflowItem = (
    <Box
      key={workflow.id}
      className={
        "workflow list" +
        (showGraphPreview ? " with-preview" : "") +
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
          onClick={handleCheckboxClick}
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
            onFocus={handleInputFocus}
            onBlur={handleNameBlur}
            onKeyDown={handleNameKeyDown}
            onClick={handleInputClick}
            style={inputStyle}
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
        <Box className="actions">
          <EditorButton
            className="open-button"
            variant="contained"
            onClick={handleOpen}
            title="Open workflow"
            density="compact"
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
          </EditorButton>
          <FavoriteButton
            isFavorite={isFavorite}
            onToggle={handleToggleFavorite}
            addTooltip="Add to favorites"
            removeTooltip="Remove from favorites"
            buttonSize="small"
            className="favorite-button"
            stopPropagation={false}
          />
          <EditButton
            onClick={handleEdit}
            tooltip="Edit workflow settings"
            buttonSize="small"
            className="edit-button"
            nodrag={false}
            sx={{ padding: "4px" }}
          />
        </Box>
      </Box>
      <Box className="date-container">
        {isFavorite && <StarIcon className="favorite-indicator" sx={{ fontSize: "0.85rem", color: "warning.main" }} />}
        {!hideDate && <Typography className="date">{relativeTime(workflow.updated_at)}</Typography>}
      </Box>
    </Box>
  );

  return (
    <Tooltip
      title={tooltipContent}
      placement="right"
      arrow
      enterDelay={TOOLTIP_ENTER_DELAY}
      enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
      slotProps={{
        tooltip: {
          sx: {
            maxWidth: "none",
            minWidth: 360,
            padding: "12px",
            "& .MuiTooltip-tooltip": {
              maxWidth: "none"
            }
          }
        },
        popper: {
          sx: {
            "& .MuiTooltip-tooltip": {
              maxWidth: "none",
              minWidth: 360
            }
          }
        }
      }}
    >
      {workflowItem}
    </Tooltip>
  );
};

export default memo(WorkflowListItem, isEqual);
