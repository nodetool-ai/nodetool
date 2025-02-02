/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React from "react";
import { Box, Button, Tooltip, Typography } from "@mui/material";
import { Workflow } from "../../stores/ApiTypes";
import { relativeTime } from "../../utils/formatDateAndTime";
import Checkbox from "@mui/material/Checkbox";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { usePanelStore } from "../../stores/PanelStore";
import DeleteIcon from "@mui/icons-material/Delete";
import { useNodes } from "../../contexts/NodeContext";

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

export const WorkflowListView: React.FC<WorkflowListViewProps> = ({
  workflows,
  onOpenWorkflow,
  onDuplicateWorkflow,
  onSelect,
  onDelete,
  onScroll,
  selectedWorkflows,
  showCheckboxes
}) => {
  // const currentWorkflow = useNodes((state) => state.workflow);
  const panelSize = usePanelStore((state) => state.panel.panelSize);
  const addBreaks = (text: string) => {
    return text.replace(/([-_.])/g, "$1<wbr>");
  };
  const currentWorkflow = useNodes((state) => state.workflow);

  return (
    <Box className="container list" css={listStyles} onScroll={onScroll}>
      {workflows.map((workflow: Workflow) => (
        <Box
          key={workflow.id}
          className={
            "workflow list" +
            (selectedWorkflows?.includes(workflow.id) ? " selected" : "") +
            (currentWorkflow?.id === workflow.id ? " current" : "")
          }
          onContextMenu={(e) => {
            e.preventDefault();
          }}
          onClick={(e) => {
            if (!e.defaultPrevented) {
              onOpenWorkflow(workflow);
            }
          }}
        >
          {showCheckboxes && (
            <Checkbox
              className="checkbox"
              size="small"
              checked={selectedWorkflows?.includes(workflow.id) || false}
              onClick={(e) => {
                e.preventDefault();
                onSelect(workflow);
              }}
            />
          )}
          <div
            className="name"
            dangerouslySetInnerHTML={{ __html: addBreaks(workflow.name) }}
          ></div>
          <div className="actions">
            {panelSize >= 400 && (
              <Typography
                className="date"
                data-microtip-position="top"
                aria-label="Last modified"
                role="tooltip"
              >
                {relativeTime(workflow.updated_at)} <br />
              </Typography>
            )}
            <Button
              size="small"
              className="duplicate-button"
              onClick={(event) => {
                event.preventDefault();
                onDuplicateWorkflow(event, workflow);
              }}
              data-microtip-position="bottom"
              aria-label="Duplicate"
              role="tooltip"
            >
              <ContentCopyIcon />
            </Button>
            <Button
              size="small"
              className="delete-button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onDelete(workflow);
              }}
            >
              <DeleteIcon />
            </Button>
          </div>
        </Box>
      ))}
    </Box>
  );
};
