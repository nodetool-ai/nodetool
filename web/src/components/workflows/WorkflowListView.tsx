/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo } from "react";
import { Box } from "@mui/material";
import { Workflow } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import WorkflowListItem from "./WorkflowListItem";
import isEqual from "lodash/isEqual";
import { FixedSizeList } from "react-window";
import { useShowGraphPreview } from "../../stores/WorkflowListViewStore";

interface WorkflowListViewProps {
  workflows: Workflow[];
  onOpenWorkflow: (workflow: Workflow) => void;
  onDuplicateWorkflow: (event: React.MouseEvent, workflow: Workflow) => void;
  onSelect: (workflow: Workflow) => void;
  onDelete: (workflow: Workflow) => void;
  onEdit: (workflow: Workflow) => void;
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
      borderLeft: `3px solid transparent`,
      borderRadius: 6,
      transition: "background 0.18s ease, border-color 0.2s ease",
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
    ".date": {
      position: "absolute",
      right: "0.75em",
      color: theme.vars.palette.grey[300],
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
      top: "8px",
      right: "0.35em",
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      width: "100px",
      button: {
        opacity: 0,
        padding: "0",
        color: theme.vars.palette.grey[100],
        "&:hover": {
          backgroundColor: theme.vars.palette.grey[500]
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

  const ITEM_HEIGHT = showGraphPreview ? 150 : 50;
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
          onOpenAsApp={onOpenAsApp}
          isAlternate={index % 2 === 1}
        />
      </div>
    );
  };

  return (
    <Box className="container list" css={listStyles(theme)}>
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
