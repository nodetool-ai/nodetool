/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Workflow } from "../../stores/ApiTypes";
import isEqual from "../../utils/isEqual";
import { WorkflowMiniPreview } from "../version/WorkflowMiniPreview";
import useContextMenuStore from "../../stores/ContextMenuStore";
import { useWorkflowActionsStore } from "../../stores/WorkflowActionsStore";
import { useShowGraphPreview } from "../../stores/WorkflowListViewStore";
import { useIsWorkflowFavorite, useFavoriteWorkflowActions } from "../../stores/FavoriteWorkflowsStore";
import StarIcon from "@mui/icons-material/Star";
import { FavoriteButton, FlexColumn, FlexRow, Text, Tooltip, Checkbox, Box, FONT_WEIGHT, InlineEditableText, SPACING, getSpacingPx, Chip, ICON_SIZE } from "../ui_primitives";
import { WorkflowTriggerIndicator } from "./WorkflowTriggerIndicator";

// Single-click on the row opens the workflow. Double-clicking the name renames
// it inline instead, so the open is deferred briefly to let a following
// double-click cancel it.
const OPEN_CLICK_DELAY_MS = 200;

function formatWorkflowUpdatedAt(
  value: string,
  locale: string
): string {
  const elapsedSeconds = (Date.now() - new Date(value).getTime()) / 1000;
  const relativeTimeFormat = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (elapsedSeconds < 5) {
    return relativeTimeFormat.format(0, "second");
  }
  const units = [
    { unit: "year" as const, seconds: 31_557_600 },
    { unit: "month" as const, seconds: 2_629_800 },
    { unit: "week" as const, seconds: 604_800 },
    { unit: "day" as const, seconds: 86_400 },
    { unit: "hour" as const, seconds: 3_600 },
    { unit: "minute" as const, seconds: 60 },
    { unit: "second" as const, seconds: 1 }
  ];
  const selectedUnit = units.find((item) => elapsedSeconds >= item.seconds);
  if (!selectedUnit) {
    return relativeTimeFormat.format(0, "second");
  }
  const count = Math.floor(elapsedSeconds / selectedUnit.seconds);
  return relativeTimeFormat.format(-count, selectedUnit.unit);
}

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
  const { t, i18n } = useTranslation();
  const openContextMenu = useContextMenuStore((state) => state.openContextMenu);
  const setActions = useWorkflowActionsStore((state) => state.setActions);
  const clearActions = useWorkflowActionsStore((state) => state.clearActions);
  const showGraphPreview = useShowGraphPreview();
  const isFavorite = useIsWorkflowFavorite(workflow.id);
  const { toggleFavorite } = useFavoriteWorkflowActions();

  const [isEditing, setIsEditing] = useState(false);
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
      if (e.target !== e.currentTarget || isEditing || (e.key !== "Enter" && e.key !== " ")) {
        return;
      }
      e.preventDefault();
      cancelPendingOpen();
      if (showCheckboxes) {
        onSelect(workflow);
      } else {
        onOpenWorkflow(workflow);
      }
    },
    [isEditing, showCheckboxes, onSelect, onOpenWorkflow, cancelPendingOpen, workflow]
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

  const handleRename = useCallback(
    (newName: string) => {
      onRename(workflow, newName);
    },
    [onRename, workflow]
  );

  const handleCheckboxClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onSelect(workflow);
    },
    [onSelect, workflow]
  );

  const inputSx = useMemo(
    () => ({
      border: "1px solid var(--palette-primary-main)",
      padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.md)}`,
      fontWeight: FONT_WEIGHT.medium,
      lineHeight: "2em",
      width: "calc(100% - 140px)"
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
      <FlexColumn gap={SPACING.xs} sx={{ width: hasGraph ? 320 : "auto", maxWidth: 320, padding: getSpacingPx(SPACING.xl) }}>
        <Text size="small" weight={500}>
          {workflow.name}
        </Text>
        {hasDescription && (
          <Text size="smaller" color="secondary" sx={{ mt: SPACING.xs }}>
            {workflow.description}
          </Text>
        )}
        {hasTags && (
          <FlexRow gap={SPACING.micro} sx={{ flexWrap: "wrap", mt: SPACING.xs }}>
            {workflow.tags?.map((tag) => (
              <Chip key={tag} compact label={tag} />
            ))}
          </FlexRow>
        )}
        {hasGraph && (
          <Box sx={{ 
            mt: SPACING.xs,
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
      aria-label={t(showCheckboxes ? "pass3_38.workflowListItem.selectWorkflow" : "pass3_38.workflowListItem.openWorkflow", { name: workflow.name })}
      aria-pressed={showCheckboxes ? isSelected : undefined}
      onClick={handleRowClick}
      onKeyDown={handleRowKeyDown}
      onContextMenu={handleContextMenu}
    >
      {showCheckboxes && (
        <Checkbox
          className="checkbox"
          size="small"
          checked={isSelected}
          slotProps={{ input: { "aria-label": t("pass3_38.workflowListItem.selectWorkflow", { name: workflow.name }) } }}
          onClick={handleCheckboxClick}
        />
      )}
      <Box className="preview-container" sx={{ flexGrow: 1, width: "100%", mr: SPACING.none }}>
        {showGraphPreview && (
          <WorkflowMiniPreview
            workflow={workflow}
            width="100%"
            height={100}
            label={workflow.name}
          />
        )}
        <InlineEditableText
          value={workflow.name}
          editing={isEditing}
          onEditingChange={setIsEditing}
          onCommit={handleRename}
          ariaLabel={t("pass3_38.workflowListItem.workflowName")}
          sx={inputSx}
        >
          <Tooltip title={t("pass3_38.workflowListItem.renameTooltip")} describeChild>
            <Text
              className="name"
              size="small"
              weight={500}
              sx={{ lineHeight: 1.35 }}
              onDoubleClick={handleNameDoubleClick}
            >
              {workflow.name}
            </Text>
          </Tooltip>
        </InlineEditableText>
        <Box className="actions">
          <FavoriteButton
            isFavorite={isFavorite}
            onToggle={handleToggleFavorite}
            addTooltip={t("pass3_38.workflowListItem.addFavorite")}
            removeTooltip={t("pass3_38.workflowListItem.removeFavorite")}
            buttonSize="small"
            className="favorite-button"
            stopPropagation
          />
        </Box>
      </Box>
      <Box className="date-container">
        <WorkflowTriggerIndicator workflowId={workflow.id} />
        {isFavorite && <StarIcon className="favorite-indicator" sx={{ fontSize: ICON_SIZE.sm, color: "warning.main" }} />}
        {!hideDate && (
          <Text
            className="date"
            size="smaller"
            color="secondary"
            sx={{ lineHeight: 2.4, textTransform: "uppercase" }}
          >
            {formatWorkflowUpdatedAt(workflow.updated_at, i18n.language)}
          </Text>
        )}
      </Box>
    </Box>
  );

  return (
    <Tooltip
      title={tooltipContent}
      placement="right"
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
