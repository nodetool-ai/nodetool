/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useMemo, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Text,
  MOTION,
  BORDER_RADIUS,
  EYEBROW,
  SPACING,
  TYPOGRAPHY,
  getSpacingPx,
  Z_INDEX,
  VirtualList,
  reducedMotion,
  selectableRowStyles,
  selectedRowStyles
} from "../ui_primitives";
import type { VirtualListHandle } from "../ui_primitives";
import { Workflow } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import WorkflowListItem from "./WorkflowListItem";
import { useShowGraphPreview, useSortBy } from "../../stores/WorkflowListViewStore";
import { groupByDate } from "../../utils/groupByDate";

type ListItem =
  | { type: "header"; label: string }
  | { type: "workflow"; workflow: Workflow };

interface WorkflowListViewProps {
  workflows: Workflow[];
  onOpenWorkflow: (workflow: Workflow) => void;
  onDuplicateWorkflow: (event: React.MouseEvent, workflow: Workflow) => void;
  onSelect: (workflow: Workflow) => void;
  onDelete: (workflow: Workflow) => void;
  onEdit: (workflow: Workflow) => void;
  onRename: (workflow: Workflow, newName: string) => void;
  onOpenAsApp?: (workflow: Workflow) => void;
  onScroll?: (event: React.UIEvent<HTMLDivElement>) => void;
  selectedWorkflows: string[] | null;
  workflowCategory: string;
  showCheckboxes: boolean;
}

const listStyles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      rowGap: "0px",
      alignItems: "flex-start",
      margin: "0",
      overflow: "hidden auto"
    },
    ".workflow": {
      flex: 1,
      height: "100%",
      padding: theme.spacing(0, 1),
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      margin: `0 0 ${getSpacingPx(SPACING.micro)}`,
      width: "100%",
      cursor: "pointer",
      border: 0,
      ...selectableRowStyles(theme),
      "& .MuiCheckbox-root": {
        margin: `0 ${getSpacingPx(SPACING.lg)} 0 0`,
        padding: 0
      },
      position: "relative"
    },
    ".workflow.selected, .workflow.current": selectedRowStyles(theme),
    ".workflow img": {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    },
    ".preview-container": {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      justifyContent: "center",
      position: "relative"
    },
    ".workflow:not(.with-preview):not(.hide-date) .preview-container": {
      paddingRight: `calc(${getSpacingPx(SPACING.xxl)} * 2 + ${getSpacingPx(SPACING.xxxl)} + ${getSpacingPx(SPACING.xs)})` // was 84px
    },
    ".name": {
      ...TYPOGRAPHY.sans.label,
      color: theme.vars.palette.text.primary,
      userSelect: "none",
      flex: "1",
      display: "-webkit-box",
      WebkitLineClamp: 1,
      WebkitBoxOrient: "vertical",
      overflow: "hidden",
      textOverflow: "ellipsis",
      paddingRight: "0"
    },
    ".date-container": {
      position: "absolute",
      top: "50%",
      transform: "translateY(-50%)",
      right: getSpacingPx(SPACING.lg),
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-start",
      gap: getSpacingPx(SPACING.xs),
      width: "76px",
      flexShrink: 0,
      padding: "0",
      background: `linear-gradient(to right, transparent, rgb(${theme.vars.palette.background.defaultChannel} / 0.94) 18px)`
    },
    ".favorite-indicator": {
      flexShrink: 0
    },
    ".workflow:hover .date-container, .workflow:focus-within .date-container": {
      opacity: 0
    },
    ".date": {
      width: "100%",
      fontWeight: 400,
      lineHeight: 1.1,
      userSelect: "none",
      textAlign: "left",
      letterSpacing: "0.02em",
      textTransform: "uppercase",
      whiteSpace: "nowrap"
    },
    ".duplicate-button svg": {
      transform: "scale(0.7)"
    },
    // List view (no preview) - actions overlay text on hover
    ".actions": {
      position: "absolute",
      top: "50%",
      transform: "translateY(-50%)",
      right: getSpacingPx(SPACING.xs),
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: getSpacingPx(SPACING.xs),
      zIndex: Z_INDEX.dropdown,
      opacity: 0,
      transition: MOTION.opacity,
      ...reducedMotion({ transition: MOTION.none }),
      background: `linear-gradient(to right, transparent, rgb(${theme.vars.palette.background.defaultChannel} / 0.96) 16px)`,
      paddingLeft: getSpacingPx(SPACING.xxl),
      button: {
        opacity: 1,
        color: theme.vars.palette.text.secondary,
        "&:hover": {
          backgroundColor: theme.vars.palette.action.hover,
          color: theme.vars.palette.text.primary
        }
      }
    },
    // Keyboard focus on the row (or on an action inside it) reveals the
    // actions too, and a touch screen, which never hovers, shows them outright.
    ".workflow:hover .actions, .workflow:focus-within .actions": {
      opacity: 1
    },
    "@media (hover: none)": {
      ".workflow .actions": { opacity: 1 },
      ".workflow .date-container": { opacity: 0 }
    },
    // Preview mode - actions overlay on top of preview with background
    ".workflow.with-preview .actions": {
      top: getSpacingPx(SPACING.xs),
      right: getSpacingPx(SPACING.xs),
      transform: "none",
      backgroundColor: theme.vars.palette.c_scrim_soft,
      borderRadius: BORDER_RADIUS.sm,
      padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.sm)}`,
      backdropFilter: "blur(4px)",
      gap: getSpacingPx(SPACING.xs)
    },
    // Preview mode - date at top right with higher z-index
    ".workflow.with-preview .date-container": {
      top: getSpacingPx(SPACING.xs),
      right: getSpacingPx(SPACING.xs),
      transform: "none",
      zIndex: Z_INDEX.raised,
      backgroundColor: theme.vars.palette.c_scrim_soft,
      borderRadius: BORDER_RADIUS.sm,
      padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.sm)}`
    },
    // The virtualizer gives header rows a fixed 16px, so the eyebrow keeps a
    // tight line height to sit inside it.
    ".date-header-row": {
      width: "100%",
      padding: `0 ${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.micro)}`,
      alignItems: "flex-end"
    },
    ".date-header": {
      ...EYEBROW,
      color: theme.vars.palette.text.secondary,
      flexShrink: 0,
      padding: 0,
      lineHeight: 1.1,
      textAlign: "left",
      whiteSpace: "nowrap"
    }
  });

function formatRelativeDateLabel(label: string, locale: string): string {
  const match = /^([0-9]+) (years?|months?|weeks?|days?) ago$/.exec(label);
  if (!match) {
    return label;
  }
  const count = Number(match[1]);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  switch (match[2]) {
    case "year":
    case "years":
      return formatter.format(-count, "year");
    case "month":
    case "months":
      return formatter.format(-count, "month");
    case "week":
    case "weeks":
      return formatter.format(-count, "week");
    case "day":
    case "days":
      return formatter.format(-count, "day");
    default:
      return label;
  }
}

const WorkflowListView: React.FC<WorkflowListViewProps> = ({
  workflows,
  onOpenWorkflow,
  onDuplicateWorkflow,
  onSelect,
  onDelete,
  onEdit,
  onRename,
  onOpenAsApp,
  onScroll,
  selectedWorkflows,
  showCheckboxes
}) => {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const cssStyles = useMemo(() => listStyles(theme), [theme]);
  const currentWorkflowId = useWorkflowManager(
    (state) => state.currentWorkflowId
  );
  const showGraphPreview = useShowGraphPreview();
  const sortBy = useSortBy();
  const listRef = useRef<VirtualListHandle>(null);

  const WORKFLOW_HEIGHT = showGraphPreview ? 280 : 28;
  const HEADER_HEIGHT = 16;

  // Group workflows by date and create a flat list with headers
  const flatList = useMemo(() => {
    const items: ListItem[] = [];

    // Date sort is the default. Timestamps are parsed once per workflow
    // instead of twice per comparison, then dropped again.
    const sortedWorkflows =
      sortBy === "name"
        ? [...workflows].sort((a, b) => a.name.localeCompare(b.name))
        : workflows
            .map((workflow) => ({
              workflow,
              updatedAt: Date.parse(workflow.updated_at)
            }))
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((entry) => entry.workflow);

    // Only show date headers when sorting by date
    if (sortBy === "date") {
      // One `now` for the whole pass; `groupByDate` otherwise builds a fresh
      // Date per workflow.
      const now = new Date();
      let currentGroup = "";
      for (const workflow of sortedWorkflows) {
        const group = groupByDate(workflow.updated_at, now);
        if (group !== currentGroup) {
          currentGroup = group;
          items.push({ type: "header", label: group });
        }
        items.push({ type: "workflow", workflow });
      }
    } else {
      // For name sort, no headers
      for (const workflow of sortedWorkflows) {
        items.push({ type: "workflow", workflow });
      }
    }

    return items;
  }, [workflows, sortBy]);

  const estimateSize = useCallback(
    (index: number) =>
      flatList[index]?.type === "header" ? HEADER_HEIGHT : WORKFLOW_HEIGHT,
    [flatList, HEADER_HEIGHT, WORKFLOW_HEIGHT]
  );

  const getItemKey = useCallback(
    (item: ListItem) =>
      item.type === "header"
        ? `header-${item.label}`
        : `workflow-${item.workflow.id}`,
    []
  );

  const getItemProps = useCallback(
    (item: ListItem) => ({
      className: item.type === "header" ? "date-header-row" : undefined,
      style: { display: "flex" } as React.CSSProperties
    }),
    []
  );

  // Reset measurement cache when row sizes or list contents change
  useEffect(() => {
    listRef.current?.measure();
  }, [flatList, showGraphPreview, sortBy]);

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      onScroll?.(event);
    },
    [onScroll]
  );

  const renderItem = useCallback(
    (item: ListItem) => {
      if (item.type === "header") {
        const today = t("pass3_38.workflowListView.today");
        const yesterday = t("pass3_38.workflowListView.yesterday");
        const label = item.label === "Today"
          ? today
          : item.label === "Yesterday"
            ? yesterday
            : formatRelativeDateLabel(item.label, i18n.language);
        return (
          <Text
            className="date-header"
            size="smaller"
            color="secondary"
            weight={400}
            sx={{ ...EYEBROW, lineHeight: 1.1, width: "100%" }}
          >
            {label}
          </Text>
        );
      }
      const { workflow } = item;
      return (
        <WorkflowListItem
          workflow={workflow}
          isSelected={selectedWorkflows?.includes(workflow.id) || false}
          isCurrent={currentWorkflowId === workflow.id}
          showCheckboxes={showCheckboxes}
          hideDate={sortBy === "date"}
          onOpenWorkflow={onOpenWorkflow}
          onDuplicateWorkflow={onDuplicateWorkflow}
          onSelect={onSelect}
          onDelete={onDelete}
          onEdit={onEdit}
          onRename={onRename}
          onOpenAsApp={onOpenAsApp}
        />
      );
    },
    [
      selectedWorkflows,
      currentWorkflowId,
      showCheckboxes,
      sortBy,
      onOpenWorkflow,
      onDuplicateWorkflow,
      onSelect,
      onDelete,
      onEdit,
      onRename,
      onOpenAsApp,
      t,
      i18n.language
    ]
  );

  return (
    <VirtualList
      ref={listRef}
      className="container list"
      css={cssStyles}
      onScroll={handleScroll}
      direction="both"
      sx={{ height: "100%", width: "100%", overflow: "auto" }}
      items={flatList}
      estimateSize={estimateSize}
      overscan={theme.virtualScroll.overscan.normal}
      getItemKey={getItemKey}
      getItemProps={getItemProps}
      ariaLabel={t("pass3_38.workflowListView.workflowsLabel")}
      renderItem={renderItem}
    />
  );
};

export default memo(WorkflowListView);
