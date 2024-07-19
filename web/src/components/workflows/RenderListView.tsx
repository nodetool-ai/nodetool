/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React from "react";
import { Box, Button, Tooltip, Typography } from "@mui/material";
import { Workflow } from "../../stores/ApiTypes";
import { prettyDate } from "../../utils/formatDateAndTime";
import { truncateString } from "../../utils/truncateString";
import DeleteButton from "../buttons/DeleteButton";
import { useSettingsStore } from "../../stores/SettingsStore";
import { TOOLTIP_ENTER_DELAY } from "../node/BaseNode";

interface RenderListViewProps {
  workflows: Workflow[];
  onClickOpen: (workflow: Workflow) => void;
  onDoubleClickWorkflow: (workflow: Workflow) => void;
  onDuplicateWorkflow: (event: React.MouseEvent, workflow: Workflow) => void;
  onSelect: (workflow: Workflow) => void;
  onDelete: (e: any, workflow: Workflow) => void;
  selectedWorkflows: string[] | null;
  workflowCategory: string;
}

const listStyles = (theme: any) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      margin: ".5em 1em 0 1.5em",
      maxHeight: "calc(100vh - 280px)",
      overflow: "hidden auto"
    },
    ".workflow": {
      position: "relative",
      display: "flex",
      flexDirection: "row",
      gap: "1em",
      alignItems: "flex-start",
      margin: ".25em 0",
      padding: "0.4em 0",
      width: "calc(100% - 100px)",
      cursor: "pointer",
      borderBottom: "1px solid black",
      transition: "background 0.2s"
    },
    ".workflow:hover": {
      backgroundColor: theme.palette.c_gray1,
      outline: `0`
    },
    ".workflow.selected": {
      backgroundColor: theme.palette.c_gray0,
      borderRight: `2px solid ${theme.palette.c_hl1}`,
      outline: `0`
    },
    ".name-and-description": {
      display: "flex",
      flexDirection: "column",
      gap: "0.1em"
    },
    ".name": {
      fontSize: theme.fontSizeNormal,
      margin: "0",
      lineHeight: "1em",
      color: theme.palette.c_hl1,
      userSelect: "none"
    },
    ".description": {
      margin: "0.1em 0 .1em",
      userSelect: "none"
    },
    ".date": {
      marginLeft: "auto",
      paddingRight: "1em",
      fontFamily: theme.fontFamily2,
      right: "0",
      minWidth: "150px",
      userSelect: "none"
    },
    ".image-wrapper": {
      flexShrink: 0,
      width: "40px",
      height: "40px",
      overflow: "hidden",
      position: "relative"
    },
    ".actions": {
      display: "flex",
      alignItems: "center",
      minWidth: "200px",
      marginLeft: "auto"
    }
  });

export const RenderListView: React.FC<RenderListViewProps> = ({
  workflows,
  onClickOpen,
  onDoubleClickWorkflow,
  onDuplicateWorkflow,
  onDelete,
  onSelect,
  selectedWorkflows,
  workflowCategory
}) => {
  const settings = useSettingsStore((state) => state.settings);
  const addBreaks = (text: string) => {
    return text.replace(/([-_.])/g, "$1<wbr>");
  };

  return (
    <Box className="container list" css={listStyles}>
      {workflows.map((workflow: Workflow) => (
        <Box
          key={workflow.id}
          className={
            "workflow list" +
            (selectedWorkflows?.includes(workflow.id) ? " selected" : "")
          }
          onDoubleClick={() => onDoubleClickWorkflow(workflow)}
          onClick={() => onSelect(workflow)}
        >
          <Box
            className="image-wrapper"
            sx={{
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundImage: workflow.thumbnail_url
                ? `url(${workflow.thumbnail_url})`
                : "none",
              width: "50px",
              height: "50px"
            }}
          >
            {!workflow.thumbnail_url && <Box className="image-placeholder" />}
          </Box>
          <Box className="name-and-description">
            <div
              className="name"
              dangerouslySetInnerHTML={{ __html: addBreaks(workflow.name) }}
            ></div>
            <Typography className="description">
              {truncateString(workflow.description, 350)}
            </Typography>
          </Box>
          <div className="actions">
            <Typography className="date">
              {prettyDate(workflow.updated_at, "verbose", settings)}
            </Typography>

            <Tooltip
              title="DoubleClick a workflow to open it directly"
              placement="top"
              enterDelay={TOOLTIP_ENTER_DELAY}
            >
              <Button
                size="small"
                color="primary"
                onClick={() => onClickOpen(workflow)}
              >
                Open
              </Button>
            </Tooltip>
            {workflowCategory === "user" && (
              <>
                <Tooltip
                  title="Make a copy of this workflow"
                  placement="top"
                  enterDelay={TOOLTIP_ENTER_DELAY}
                >
                  <Button
                    size="small"
                    color="primary"
                    onClick={(event) => onDuplicateWorkflow(event, workflow)}
                  >
                    Duplicate
                  </Button>
                </Tooltip>
                {workflowCategory === "user" && (
                  <DeleteButton<Workflow> item={workflow} onClick={onDelete} />
                )}
              </>
            )}
          </div>
        </Box>
      ))}
    </Box>
  );
};
