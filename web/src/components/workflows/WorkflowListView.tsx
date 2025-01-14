/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React from "react";
import { Box, Button, Tooltip, Typography } from "@mui/material";
import { Workflow } from "../../stores/ApiTypes";
import { relativeTime } from "../../utils/formatDateAndTime";
import { useSettingsStore } from "../../stores/SettingsStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import Checkbox from "@mui/material/Checkbox";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useNodeStore } from "../../stores/NodeStore";

interface WorkflowListViewProps {
  workflows: Workflow[];
  onOpenWorkflow: (workflow: Workflow) => void;
  onDuplicateWorkflow: (event: React.MouseEvent, workflow: Workflow) => void;
  onSelect: (workflow: Workflow) => void;
  onDelete: (e: any, workflow: Workflow) => void;
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
      padding: "1em 1em 0.5em 1em",
      display: "flex",
      flexDirection: "row",
      alignItems: "flex-start",
      margin: "0",
      width: "100%",
      cursor: "pointer",
      borderBottom: "1px solid black",
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
      backgroundColor: theme.palette.c_gray1,
      outline: `0`
    },
    ".workflow.selected": {
      backgroundColor: theme.palette.c_gray2,
      borderRight: `2px solid ${theme.palette.c_hl1}`,
      outline: `0`
    },
    ".name": {
      fontSize: theme.fontSizeSmall,
      margin: "0",
      lineHeight: "1.4em",
      color: theme.palette.c_hl1,
      userSelect: "none"
    },
    ".date": {
      paddingRight: "0.5em",
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeTiny,
      right: "0",
      height: "2em",
      lineHeight: "2em",
      minWidth: "80px",
      userSelect: "none",
      textAlign: "right"
    },
    ".duplicate-button": {
      padding: "0"
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
  onDelete,
  onSelect,
  onScroll,
  selectedWorkflows,
  workflowCategory,
  showCheckboxes
}) => {
  const settings = useSettingsStore((state) => state.settings);
  const currentWorkflow = useNodeStore((state) => state.workflow);

  const addBreaks = (text: string) => {
    return text.replace(/([-_.])/g, "$1<wbr>");
  };

  return (
    <Box className="container list" css={listStyles} onScroll={onScroll}>
      {workflows.map((workflow: Workflow) => (
        <Tooltip
          key={workflow.id}
          title="Click to open workflow"
          placement="top"
          enterDelay={TOOLTIP_ENTER_DELAY}
        >
          <Box
            className={
              "workflow list" +
              (selectedWorkflows?.includes(workflow.id) ? " selected" : "") +
              (currentWorkflow?.id === workflow.id ? " current" : "")
            }
            onClick={(e) => {
              if (!e.defaultPrevented) {
                onOpenWorkflow(workflow);
              }
            }}
          >
            {showCheckboxes && (
              <Tooltip
                title="Select workflow"
                placement="top"
                enterDelay={TOOLTIP_ENTER_DELAY}
              >
                <Checkbox
                  className="checkbox"
                  size="small"
                  checked={selectedWorkflows?.includes(workflow.id) || false}
                  onClick={(e) => {
                    e.preventDefault();
                    onSelect(workflow);
                  }}
                />
              </Tooltip>
            )}
            <Tooltip
              title={workflow.description}
              placement="top"
              enterDelay={TOOLTIP_ENTER_DELAY}
            >
              <div
                className="name"
                dangerouslySetInnerHTML={{ __html: addBreaks(workflow.name) }}
              ></div>
            </Tooltip>
            <div className="actions">
              <Tooltip
                title="Last modified"
                placement="top"
                enterDelay={TOOLTIP_ENTER_DELAY}
              >
                <Typography className="date">
                  {relativeTime(workflow.updated_at)} <br />
                </Typography>
              </Tooltip>

              <Tooltip
                title="Make a copy of this workflow"
                placement="bottom"
                enterDelay={TOOLTIP_ENTER_DELAY}
              >
                <Button
                  size="small"
                  className="duplicate-button"
                  onClick={(event) => {
                    event.preventDefault();
                    onDuplicateWorkflow(event, workflow);
                  }}
                >
                  <ContentCopyIcon />
                </Button>
              </Tooltip>
            </div>
          </Box>
        </Tooltip>
      ))}
    </Box>
  );
};
