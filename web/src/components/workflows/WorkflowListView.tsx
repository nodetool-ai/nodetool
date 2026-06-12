/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useMemo, useRef, useEffect, useCallback } from "react";
import { Text, Box, MOTION } from "../ui_primitives";
import { Workflow } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import WorkflowListItem from "./WorkflowListItem";
import { useVirtualizer } from "@tanstack/react-virtual";
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
      margin: "0 0 2px",
      width: "100%",
      cursor: "pointer",
      outline: "none",
      border: 0,
      borderRadius: theme.rounded.md,
      backgroundColor: "transparent",
      transition: `background-color ${MOTION.normal}, color ${MOTION.normal}`,
      "& .MuiCheckbox-root": {
        margin: "0 0.75em 0 0",
        padding: 0
      },
      position: "relative"
    },
    ".workflow.current .name": {
      color: theme.vars.palette.primary.light
    },
    ".workflow.selected, .workflow.current": {
      backgroundColor: theme.vars.palette.action.selected
    },
    ".workflow:hover": {
      backgroundColor: theme.vars.palette.action.hover
    },
    ".workflow:focus-visible": {
      outline: `2px solid ${theme.vars.palette.primary.main}`,
      outlineOffset: -2
    },
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
      paddingRight: "84px"
    },
    ".name": {
      fontSize: theme.fontSizeSmall,
      fontWeight: 600,
      lineHeight: 1.35,
      color: theme.vars.palette.text.primary,
      userSelect: "none",
      flex: "1",
      display: "-webkit-box",
      WebkitLineClamp: 1,
      WebkitBoxOrient: "vertical",
      overflow: "hidden",
      textOverflow: "ellipsis",
      paddingRight: "0",
      letterSpacing: "0.01em"
    },
    ".date-container": {
      position: "absolute",
      top: "50%",
      transform: "translateY(-50%)",
      right: "0.75em",
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-start",
      gap: "4px",
      width: "76px",
      flexShrink: 0,
      padding: "0",
      background: `linear-gradient(to right, transparent, rgb(${theme.vars.palette.background.defaultChannel} / 0.94) 18px)`
    },
    ".favorite-indicator": {
      flexShrink: 0
    },
    ".workflow:hover .date-container": {
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
      right: "0.35em",
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: "4px",
      zIndex: 10,
      opacity: 0,
      transition: MOTION.opacity,
      background: `linear-gradient(to right, transparent, rgb(${theme.vars.palette.background.defaultChannel} / 0.96) 16px)`,
      paddingLeft: "24px",
      button: {
        opacity: 1,
        color: theme.vars.palette.text.secondary,
        "&:hover": {
          backgroundColor: theme.vars.palette.action.hover,
          color: theme.vars.palette.text.primary
        }
      }
    },
    ".workflow:hover .actions": {
      opacity: 1
    },
    // Preview mode - actions overlay on top of preview with background
    ".workflow.with-preview .actions": {
      top: "4px",
      right: "4px",
      transform: "none",
      backgroundColor: "rgba(0, 0, 0, 0.35)",
      borderRadius: "var(--rounded-sm)",
      padding: "4px 6px",
      backdropFilter: "blur(4px)",
      gap: "4px"
    },
    // Preview mode - date at top right with higher z-index
    ".workflow.with-preview .date-container": {
      top: "5px",
      right: "5px",
      transform: "none",
      zIndex: 5,
      backgroundColor: "rgba(0, 0, 0, 0.35)",
      borderRadius: "var(--rounded-sm)",
      padding: "2px 6px"
    },
    ".date-header-row": {
      width: "100%",
      padding: "0 12px 4px 0",
      alignItems: "flex-end",
      borderBottom: "1px solid var(--palette-divider)"
    },
    ".date-header": {
      fontSize: theme.fontSizeSmaller,
      flexShrink: 0,
      padding: 0,
      lineHeight: 1.1,
      textAlign: "right",
      letterSpacing: "0.02em",
      textTransform: "uppercase",
      whiteSpace: "nowrap"
    }
  });

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
  const theme = useTheme();
  const cssStyles = useMemo(() => listStyles(theme), [theme]);
  const currentWorkflowId = useWorkflowManager(
    (state) => state.currentWorkflowId
  );
  const showGraphPreview = useShowGraphPreview();
  const sortBy = useSortBy();
  const containerRef = useRef<HTMLDivElement>(null);

  const WORKFLOW_HEIGHT = showGraphPreview ? 280 : 28;
  const HEADER_HEIGHT = 16;

  // Group workflows by date and create a flat list with headers
  const flatList = useMemo(() => {
    const items: ListItem[] = [];

    // Sort workflows based on sortBy option
    const sortedWorkflows = [...workflows].sort((a, b) => {
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      }
      // Default: sort by date (most recent first)
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

    // Only show date headers when sorting by date
    if (sortBy === "date") {
      let currentGroup = "";
      for (const workflow of sortedWorkflows) {
        const group = groupByDate(workflow.updated_at);
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

  const virtualizer = useVirtualizer({
    count: flatList.length,
    getScrollElement: () => containerRef.current,
    estimateSize: (index) =>
      flatList[index]?.type === "header" ? HEADER_HEIGHT : WORKFLOW_HEIGHT,
    overscan: theme.virtualScroll.overscan.normal,
    getItemKey: (index) => {
      const item = flatList[index];
      return item.type === "header"
        ? `header-${item.label}`
        : `workflow-${item.workflow.id}`;
    },
  });

  // Reset measurement cache when row sizes or list contents change
  useEffect(() => {
    virtualizer.measure();
  }, [flatList, showGraphPreview, sortBy, virtualizer]);

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      onScroll?.(event);
    },
    [onScroll]
  );

  return (
    <Box
      ref={containerRef}
      className="container list"
      css={cssStyles}
      onScroll={handleScroll}
      sx={{ height: "100%", width: "100%", overflow: "auto" }}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
          flexShrink: 0,
        }}
      >
        {virtualizer.getVirtualItems().map((vi) => {
          const item = flatList[vi.index];
          const itemStyle: React.CSSProperties = {
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: vi.size,
            transform: `translateY(${vi.start}px)`,
            display: "flex",
          };
          if (item.type === "header") {
            return (
              <div key={vi.key} className="date-header-row" style={itemStyle}>
                <Text
                  className="date-header"
                  size="small"
                  color="secondary"
                  weight={400}
                  sx={{ lineHeight: 1.1, textTransform: "uppercase", textAlign: "right", width: "100%" }}
                >
                  {item.label}
                </Text>
              </div>
            );
          }
          const { workflow } = item;
          return (
            <div key={vi.key} style={itemStyle}>
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
            </div>
          );
        })}
      </div>
    </Box>
  );
};

export default memo(WorkflowListView);