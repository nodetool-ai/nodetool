/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useMemo, useRef, useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";
import { Workflow } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import WorkflowListItem from "./WorkflowListItem";
import { VariableSizeList } from "react-window";
import { useShowGraphPreview } from "../../stores/WorkflowListViewStore";
import { groupByDate } from "../../utils/groupByDate";

type ListItem = 
  | { type: "header"; label: string }
  | { type: "workflow"; workflow: Workflow; index: number };

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
      height: "100%",
      padding: "4px 8px 4px 12px",
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      margin: "0",
      width: "100%",
      cursor: "pointer",
      outline: "none",
      border: "none",
      borderRadius: 3,
      transition: "background 0.18s ease",
      "& .MuiCheckbox-root": {
        margin: "0 0.75em 0 0",
        padding: 0
      },
      position: "relative"
    },
    ".workflow.alternate": {
      backgroundColor: `${theme.vars.palette.grey[600]}20`
    },
    ".workflow.current .name": {
      color: "var(--palette-primary-light)",
      fontWeight: 600
    },
    ".workflow.selected .name": {
      fontSize: "1em"
    },
    ".workflow:hover": {
      backgroundColor: theme.vars.palette.grey[600]
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
      justifyContent: "center"
    },
    ".name": {
      fontSize: theme.fontSizeSmall,
      fontWeight: 500,
      lineHeight: "2.5em",
      color: theme.vars.palette.grey[0],
      userSelect: "none",
      flex: "1",
      display: "-webkit-box",
      WebkitLineClamp: 1,
      WebkitBoxOrient: "vertical",
      overflow: "hidden",
      textOverflow: "ellipsis",
      paddingRight: "140px"
    },
    ".date-container": {
      position: "absolute",
      right: "0.75em",
      display: "flex",
      alignItems: "center",
      gap: "4px"
    },
    ".favorite-indicator": {
      flexShrink: 0
    },
    ".workflow:hover .date-container": {
      opacity: 0
    },
    ".date": {
      color: theme.vars.palette.grey[300],
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      wordSpacing: "-0.1em",
      lineHeight: "2em",
      minWidth: "80px",
      userSelect: "none",
      textAlign: "right"
    },
    ".workflow:hover .duplicate-button, .workflow:hover .delete-button": {
      opacity: 1
    },
    ".duplicate-button svg": {
      transform: "scale(0.7)"
    },
    ".workflow:hover button": {
      opacity: 1
    },
    ".actions": {
      position: "absolute",
      top: "50%",
      transform: "translateY(-50%)",
      right: "0.35em",
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: "2px",
      button: {
        opacity: 0,
        color: theme.vars.palette.grey[100],
        "&:hover": {
          backgroundColor: theme.vars.palette.grey[500]
        }
      }
    },
    ".date-header": {
      padding: "8px 12px 4px",
      color: theme.vars.palette.grey[300],
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      borderBottom: `1px solid ${theme.vars.palette.grey[700]}`,
      backgroundColor: theme.vars.palette.background.paper
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
  const currentWorkflowId = useWorkflowManager(
    (state) => state.currentWorkflowId
  );
  const showGraphPreview = useShowGraphPreview();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(500);

  const WORKFLOW_HEIGHT = showGraphPreview ? 150 : 36;
  const HEADER_HEIGHT = 32;

  // Measure container height dynamically
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        setContainerHeight(containerRef.current.clientHeight);
      }
    };
    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, []);

  // Group workflows by date and create a flat list with headers
  const flatList = useMemo(() => {
    const items: ListItem[] = [];
    let currentGroup = "";
    let workflowIndex = 0;

    // Sort workflows by updated_at descending (most recent first)
    const sortedWorkflows = [...workflows].sort((a, b) => 
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );

    for (const workflow of sortedWorkflows) {
      const group = groupByDate(workflow.updated_at);
      if (group !== currentGroup) {
        currentGroup = group;
        items.push({ type: "header", label: group });
      }
      items.push({ type: "workflow", workflow, index: workflowIndex });
      workflowIndex++;
    }

    return items;
  }, [workflows]);

  const listRef = useRef<VariableSizeList>(null);

  // Reset list cache when flatList or showGraphPreview changes
  useEffect(() => {
    listRef.current?.resetAfterIndex(0);
  }, [flatList, showGraphPreview]);

  const getItemSize = (index: number) => {
    const item = flatList[index];
    return item.type === "header" ? HEADER_HEIGHT : WORKFLOW_HEIGHT;
  };

  const Row = ({
    index,
    style
  }: {
    index: number;
    style: React.CSSProperties;
  }) => {
    const item = flatList[index];

    if (item.type === "header") {
      return (
        <div style={style}>
          <Typography className="date-header">{item.label}</Typography>
        </div>
      );
    }

    const { workflow, index: workflowIndex } = item;
    return (
      <div style={style}>
        <WorkflowListItem
          key={workflow.id}
          workflow={workflow}
          isSelected={selectedWorkflows?.includes(workflow.id) || false}
          isCurrent={currentWorkflowId === workflow.id}
          showCheckboxes={showCheckboxes}
          onOpenWorkflow={onOpenWorkflow}
          onDuplicateWorkflow={onDuplicateWorkflow}
          onSelect={onSelect}
          onDelete={onDelete}
          onEdit={onEdit}
          onRename={onRename}
          onOpenAsApp={onOpenAsApp}
          isAlternate={workflowIndex % 2 === 1}
        />
      </div>
    );
  };

  return (
    <Box 
      ref={containerRef} 
      className="container list" 
      css={listStyles(theme)}
      sx={{ height: "100%", width: "100%" }}
    >
      <VariableSizeList
        ref={listRef}
        height={containerHeight}
        width="100%"
        itemCount={flatList.length}
        itemSize={getItemSize}
        onScroll={({ scrollOffset }) =>
          onScroll?.({ currentTarget: { scrollTop: scrollOffset } } as any)
        }
      >
        {Row}
      </VariableSizeList>
    </Box>
  );
};

export default memo(WorkflowListView);