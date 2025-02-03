/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React from "react";
import { Box } from "@mui/material";
import { Workflow } from "../../stores/ApiTypes";
import { usePanelStore } from "../../stores/PanelStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { WorkflowListItem } from "./WorkflowListItem";

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
      maxHeight: "calc(100vh - 280px)",
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
      }
    },
    ".workflow.current": {
      backgroundColor: theme.palette.c_gray0,
      borderLeft: `2px solid ${theme.palette.c_hl1}`,
      outline: `0`
    },
    ".workflow:hover": {
      backgroundColor: theme.palette.c_gray2,
      outline: `0`
    },
    ".workflow.selected": {
      backgroundColor: theme.palette.c_gray2,
      borderRight: `2px solid ${theme.palette.c_hl1}`,
      outline: `0`
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
export const WorkflowListView = React.memo<WorkflowListViewProps>(
  ({
    workflows,
    onOpenWorkflow,
    onDuplicateWorkflow,
    onSelect,
    onDelete,
    onScroll,
    selectedWorkflows,
    showCheckboxes
  }) => {
    const panelSize = usePanelStore((state) => state.panel.panelSize);
    const currentWorkflowId = useWorkflowManager(
      (state) => state.currentWorkflowId
    );

    return (
      <Box className="container list" css={listStyles} onScroll={onScroll}>
        {workflows.map((workflow: Workflow) => (
          <WorkflowListItem
            key={workflow.id}
            workflow={workflow}
            isSelected={selectedWorkflows?.includes(workflow.id) || false}
            isCurrent={currentWorkflowId === workflow.id}
            showCheckboxes={showCheckboxes}
            panelSize={panelSize}
            onOpenWorkflow={onOpenWorkflow}
            onDuplicateWorkflow={onDuplicateWorkflow}
            onSelect={onSelect}
            onDelete={onDelete}
          />
        ))}
      </Box>
    );
  }
);
