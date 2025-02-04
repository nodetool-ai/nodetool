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
      margin: ".5em .5em 0 0",
      maxHeight: "calc(100vh - 230px)",
      overflow: "hidden auto"
    },
    ".workflow": {
      padding: "0.25em .1em 0.25em 1em",
      display: "flex",
      flexDirection: "row",
      alignItems: "flex-start",
      margin: "0",
      width: "100%",
      cursor: "pointer",
      transition: "background 0.2s",
      "& .MuiCheckbox-root": {
        margin: "0 1em 0.5em 0",
        padding: 0
      },
      borderLeft: `2px solid transparent`
    },
    ".workflow.current": {
      backgroundColor: theme.palette.c_gray0,
      borderLeft: `2px solid ${theme.palette.c_hl1}`,
      outline: `0`
    },
    ".workflow:hover": {
      backgroundColor: theme.palette.c_gray2,
      outline: "1px solid" + theme.palette.c_gray2
    },
    ".workflow.selected": {
      outline: `0`,
      backgroundColor: `${theme.palette.c_hl1}33`
    },
    ".workflow img": {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    },
    ".name": {
      fontSize: theme.fontSizeNormal,
      fontWeight: "lighter",
      margin: "0",
      lineHeight: "1.2em",
      color: theme.palette.c_white,
      userSelect: "none"
    },
    ".date": {
      paddingRight: "0.2em",
      color: theme.palette.c_gray5,
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      right: "0",
      wordSpacing: "-0.1em",
      lineHeight: "2em",
      minWidth: "80px",
      userSelect: "none",
      textAlign: "right"
    },
    ".duplicate-button, .delete-button": {
      opacity: 0,
      padding: "0"
    },
    ".workflow:hover .duplicate-button, .workflow:hover .delete-button": {
      opacity: 1
    },
    ".duplicate-button svg": {
      transform: "scale(0.7)"
    },
    ".actions": {
      display: "flex",
      alignItems: "right",
      minWidth: "48px",
      marginLeft: "auto",
      button: {
        color: theme.palette.c_gray6,
        "&:hover": {
          backgroundColor: theme.palette.c_gray3
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
  onScroll,
  selectedWorkflows,
  showCheckboxes
}) => {
  const currentWorkflowId = useWorkflowManager(
    (state) => state.currentWorkflowId
  );

  const ITEM_HEIGHT = 38;
  const CONTAINER_HEIGHT = window.innerHeight - 230;

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
