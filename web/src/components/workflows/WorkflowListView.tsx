/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { memo } from "react";
import { Box } from "@mui/material";
import { Workflow } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import WorkflowListItem from "./WorkflowListItem";
import { isEqual } from "lodash";
import { FixedSizeList } from "react-window";

interface WorkflowListViewProps {
  workflows: Workflow[];
  onOpenWorkflow: (workflow: Workflow) => void;
  onDuplicateWorkflow: (event: React.MouseEvent, workflow: Workflow) => void;
  onSelect: (workflow: Workflow) => void;
  onDelete: (workflow: Workflow) => void;
  onEdit: (workflow: Workflow) => void;
  onScroll?: (event: React.UIEvent<HTMLDivElement>) => void;
  selectedWorkflows: string[] | null;
  workflowCategory: string;
  showCheckboxes: boolean;
}

const listStyles = (theme: any) =>
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
      height: "28px",
      padding: "0.25em .1em 0.25em 1em",
      display: "flex",
      flexDirection: "row",
      alignItems: "flex-start",
      margin: "0",
      width: "100%",
      cursor: "pointer",
      outline: "none",
      border: "none",
      transition: "background 0.2s",
      "& .MuiCheckbox-root": {
        margin: "0 1em 0.5em 0",
        padding: 0
      },
      position: "relative"
    },
    ".workflow.alternate": {
      backgroundColor: `${theme.palette.grey[600]}20`
    },
    ".workflow.current .name": {
      color: "var(--palette-primary-light)",
      fontWeight: "bold"
    },
    ".workflow.selected .name": {
      fontSize: "1em"
    },
    ".workflow:hover": {
      backgroundColor: theme.palette.grey[600]
    },
    ".workflow img": {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    },
    ".name": {
      fontSize: theme.fontSizeSmall,
      fontWeight: "lighter",
      margin: "0",
      lineHeight: "1.2em",
      color: theme.palette.c_white,
      userSelect: "none",
      flex: "1"
    },
    ".date": {
      position: "absolute",
      right: "0.5em",
      color: theme.palette.grey[200],
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      wordSpacing: "-0.1em",
      lineHeight: "2em",
      minWidth: "80px",
      userSelect: "none",
      textAlign: "right"
    },
    ".workflow:hover .date": {
      opacity: 0
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
      right: "0.5em",
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      width: "100px",
      button: {
        opacity: 0,
        padding: "0",
        color: theme.palette.grey[100],
        "&:hover": {
          backgroundColor: theme.palette.grey[500]
        },
        svg: {
          fontSize: "1.5em"
        }
      }
    }
  });

// Memoize the main WorkflowListView component
const WorkflowListView: React.FC<WorkflowListViewProps> = ({
  workflows,
  onOpenWorkflow,
  onDuplicateWorkflow,
  onSelect,
  onDelete,
  onEdit,
  onScroll,
  selectedWorkflows,
  showCheckboxes
}) => {
  const currentWorkflowId = useWorkflowManager(
    (state) => state.currentWorkflowId
  );

  const ITEM_HEIGHT = 28;
  const CONTAINER_HEIGHT = window.innerHeight - 210;

  const Row = ({
    index,
    style
  }: {
    index: number;
    style: React.CSSProperties;
  }) => {
    const workflow = workflows[index];
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
          isAlternate={index % 2 === 1}
        />
      </div>
    );
  };

  return (
    <Box className="container list" css={listStyles}>
      <FixedSizeList
        height={CONTAINER_HEIGHT}
        width="100%"
        itemCount={workflows.length}
        itemSize={ITEM_HEIGHT}
        onScroll={({ scrollOffset }) =>
          onScroll?.({ currentTarget: { scrollTop: scrollOffset } } as any)
        }
      >
        {Row}
      </FixedSizeList>
    </Box>
  );
};

export default memo(WorkflowListView, isEqual);
