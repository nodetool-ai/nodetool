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

interface RenderGridViewProps {
  workflows: Workflow[];
  onClickOpen: (workflow: Workflow) => void;
  onDoubleClickWorkflow: (workflow: Workflow) => void;
  onDuplicateWorkflow: (event: React.MouseEvent, workflow: Workflow) => void;
  onSelect: (workflow: Workflow) => void;
  onDelete: (e: any, workflow: Workflow) => void;
  selectedWorkflows: string[] | null;
  workflowCategory: string;
}

const tile_width = "200px";
const tile_height = "200px";

const gridStyles = (theme: any) =>
  css({
    "&": {
      display: "flex",
      flexWrap: "wrap",
      margin: ".5em 1em",
      maxHeight: "calc(100vh - 250px)",
      overflowY: "auto"
    },
    ".workflow": {
      boxSizing: "border-box",
      position: "relative",
      flex: `1 0 ${tile_width}`,
      margin: "1em .5em 1em .5em",
      borderBottom: "1px solid gray",
      paddingBottom: ".25em",
      maxWidth: tile_width,
      cursor: "pointer"
    },
    ".image-wrapper": {
      flexShrink: 0,
      width: tile_width,
      height: tile_height,
      overflow: "hidden",
      position: "relative"
    },
    ".name": {
      top: "-5px",
      left: "5px",
      fontSize: theme.fontSizeSmall,
      margin: "0.5em 0 .25em",
      lineHeight: "1em",
      color: theme.palette.c_hl1,
      userSelect: "none"
    },
    ".description": {
      margin: "0.25em 0 .75em",
      userSelect: "none"
    },
    ".date": { marginTop: "auto", userSelect: "none" },
    ".workflow:hover .actions": {
      display: "flex"
    },
    ".actions": {
      display: "none",
      position: "absolute",
      top: 0,
      backgroundColor: theme.palette.c_gray1,
      width: "100%",
      flexDirection: "row",
      gap: "0.5em",
      marginTop: "auto"
    },
    ".actions button": {
      padding: "0 .5em",
      margin: 0,
      height: "1.5em",
      top: 0,
      fontSize: theme.fontSizeSmaller,
      backgroundColor: "transparent",
      color: theme.palette.c_gray6,
      borderRadius: 0
    },
    ".actions button:hover": {
      color: theme.palette.c_hl1
    },
    ".actions .delete-button": {
      marginLeft: "auto"
    },
    ".actions .delete-button:hover": {
      color: theme.palette.c_delete
    }
  });

export const RenderGridView: React.FC<RenderGridViewProps> = ({
  workflows,
  onClickOpen,
  onDoubleClickWorkflow,
  onDuplicateWorkflow,
  onDelete,
  onSelect,
  selectedWorkflows,
  workflowCategory
}) => {
  const { settings } = useSettingsStore();
  const addBreaks = (text: string) => {
    return text.replace(/([-_.])/g, "$1<wbr>");
  };

  return (
    <Box className="container grid" css={gridStyles}>
      {workflows.map((workflow: Workflow) => (
        <Box
          key={workflow.id}
          onDoubleClick={() => onDoubleClickWorkflow(workflow)}
          onClick={() => onSelect(workflow)}
          className={
            "workflow grid" +
            (selectedWorkflows?.includes(workflow.id) ? " selected" : "")
          }
          sx={{ display: "flex", flexDirection: "column" }}
        >
          <Box
            className="image-wrapper"
            sx={{
              backgroundSize: "cover",
              backgroundPosition: "center top",
              backgroundImage: workflow.thumbnail_url
                ? `url(${workflow.thumbnail_url})`
                : "none",
              width: "200px",
              height: "200px"
            }}
          >
            {!workflow.thumbnail_url && <Box className="image-placeholder" />}
          </Box>

          <div
            className="name"
            dangerouslySetInnerHTML={{ __html: addBreaks(workflow.name) }}
          ></div>

          <Typography className="description">
            {truncateString(workflow.description, 150)}
          </Typography>

          <Typography className="date">
            {prettyDate(workflow.updated_at, "verbose", settings)}
          </Typography>

          <div className="actions">
            {
              <Tooltip
                title="DoubleClick to open directly"
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
            }
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
          </div>
        </Box>
      ))}
    </Box>
  );
};
