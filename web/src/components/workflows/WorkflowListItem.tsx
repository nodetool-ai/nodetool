/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Workflow } from "../../stores/ApiTypes";
import isEqual from "fast-deep-equal";
import { WorkflowMiniPreview } from "../version/WorkflowMiniPreview";
import useContextMenuStore from "../../stores/ContextMenuStore";
import { useWorkflowActionsStore } from "../../stores/WorkflowActionsStore";
import { useShowGraphPreview } from "../../stores/WorkflowListViewStore";
import { useIsWorkflowFavorite, useFavoriteWorkflowActions } from "../../stores/FavoriteWorkflowsStore";
import { relativeTime } from "../../utils/formatDateAndTime";
import StarIcon from "@mui/icons-material/Star";
import { TOOLTIP_ENTER_DELAY, TOOLTIP_ENTER_NEXT_DELAY } from "../../config/constants";
import { FavoriteButton, FlexColumn, FlexRow, Text, Tooltip, Checkbox, Box, BORDER_RADIUS, SPACING } from "../ui_primitives";

// Single-click on the row opens the workflow. Double-clicking the name renames
// it inline instead, so the open is deferred briefly to let a following
// double-click cancel it.
const OPEN_CLICK_DELAY_MS = 200;

interface WorkflowListItemProps {
  workflow: Workflow;
  isSelected: boolean;
  isCurrent: boolean;
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
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingOpen = useCallback(() => {
    if (openTimerRef.current !== null) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => cancelPendingOpen(), [cancelPendingOpen]);

  const handleToggleFavorite = useCallback(
    (_isFavorite: boolean) => {
      toggleFavorite(workflow.id);
    },
    [toggleFavorite, workflow.id]
  );

  const handleRowClick = useCallback(() => {
    if (isEditing) {
      return;
    }
    if (showCheckboxes) {
      onSelect(workflow);
      return;
    }
    // Defer so a double-click on the name can cancel this and rename instead.
    cancelPendingOpen();
    openTimerRef.current = setTimeout(() => {
      openTimerRef.current = null;
      onOpenWorkflow(workflow);
    }, OPEN_CLICK_DELAY_MS);
  }, [isEditing, showCheckboxes, onSelect, onOpenWorkflow, cancelPendingOpen, workflow]);

  const handleRowKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isEditing || (e.key !== "Enter" && e.key !== " ")) {
        return;
      }
      e.preventDefault();
      onOpenWorkflow(workflow);
    },
    [isEditing, onOpenWorkflow, workflow]
  );

  const handleNameDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      cancelPendingOpen();
      setIsEditing(true);
    },
    [cancelPendingOpen]
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
      e.stopPropagation();
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
      borderRadius: BORDER_RADIUS.sm,
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
              <Text
                key={tag}
                size="tiny"
                weight={600}
                family="secondary"
                sx={{
                  color: "grey.900",
                  backgroundColor: "grey.200",
                  borderRadius: BORDER_RADIUS.pill,
                  padding: "0.15em 0.5em",
                  margin: "0.75em 0"
                }}
              >
                {tag}
              </Text>
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
        (hideDate ? " hide-date" : "") +
        (isSelected ? " selected" : "") +
        (isCurrent ? " current" : "") +
        (isFavorite ? " favorite" : "")
      }
      role="button"
      tabIndex={0}
      aria-label={`Open workflow ${workflow.name}`}
      onClick={handleRowClick}
      onKeyDown={handleRowKeyDown}
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
            aria-label="Workflow name"
            autoFocus
            onFocus={handleInputFocus}
            onBlur={handleNameBlur}
            onKeyDown={handleNameKeyDown}
            onClick={handleInputClick}
            style={inputStyle}
          />
        ) : (
          <Text
            className="name"
            size="small"
            weight={600}
            sx={{ lineHeight: 1.35 }}
            onDoubleClick={handleNameDoubleClick}
            title="Double-click to rename"
          >
            {workflow.name}
          </Text>
        )}
        <Box className="actions">
          <FavoriteButton
            isFavorite={isFavorite}
            onToggle={handleToggleFavorite}
            addTooltip="Add to favorites"
            removeTooltip="Remove from favorites"
            buttonSize="small"
            className="favorite-button"
            stopPropagation
          />
        </Box>
      </Box>
      <Box className="date-container">
        {isFavorite && <StarIcon className="favorite-indicator" sx={{ fontSize: "var(--fontSizeNormal)", color: "warning.main" }} />}
        {!hideDate && (
          <Text
            className="date"
            size="small"
            color="secondary"
            sx={{ lineHeight: 2.4, textTransform: "uppercase" }}
          >
            {relativeTime(workflow.updated_at)}
          </Text>
        )}
      </Box>
    </Box>
  );

  return (
    <Tooltip
      title={tooltipContent}
      placement="right"
      arrow
      delay={TOOLTIP_ENTER_DELAY}
      nextDelay={TOOLTIP_ENTER_NEXT_DELAY}
      slotProps={{
        tooltip: {
          sx: {
            maxWidth: "none",
            minWidth: 360,
            padding: SPACING.lg,
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
