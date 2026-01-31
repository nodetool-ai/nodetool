/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo } from "react";
import DialogContent from "@mui/material/DialogContent";
import Button from "@mui/material/Button";
import { Dialog } from "../ui_primitives";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Workflow, WorkflowList } from "../../stores/ApiTypes";

import {
  Box,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from "@mui/material";
import { ErrorOutlineRounded } from "@mui/icons-material";
import { prettyDate, relativeTime } from "../../utils/formatDateAndTime";
import { truncateString } from "../../utils/truncateString";
import { useNavigate } from "react-router";
import { useSettingsStore } from "../../stores/SettingsStore";
import { VERSION } from "../../config/constants";
import { useAppHeaderStore } from "../../stores/AppHeaderStore";
import { client } from "../../stores/ApiClient";
import { createErrorMessage } from "../../utils/errorHandling";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import BackToDashboardButton from "../dashboard/BackToDashboardButton";
import { escapeHtml } from "../../utils/highlightText";
const styles = (theme: Theme) =>
  css({
    ".MuiBackdrop-root": { background: "transparent" },
    ".MuiPaper-root": {
      width: "70vw",
      height: "70vh",
      maxWidth: "1000px",
      maxHeight: "800px",
      padding: "2em",
      display: "flex",
      flexDirection: "column",
      gap: "1em",
      transition: "all .6s",
      background: theme.vars.palette.grey[800]
    },
    ".title": {
      position: "absolute",
      left: "2em",
      color: theme.vars.palette.grey[0],
      fontSize: "1.1em",
      margin: "0",
      textAlign: "center"
    },
    ".recent-hl": {
      marginLeft: ".75em",
      color: theme.vars.palette.grey[100],
      textTransform: "uppercase",
      fontFamily: theme.fontFamily1
    },
    ".toggle-name-date": {
      marginLeft: "auto",
      paddingRight: "3em",
      height: "1.5em"
    },
    ".content": {
      position: "relative",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      gap: "1em",
      margin: "0",
      padding: "0",

      overflow: "hidden"
    },
    ".recent": {
      position: "relative",
      display: "flex",
      flexDirection: "column",
      flexGrow: 1,
      gap: "1em",
      height: "75%",
      width: "100%"
    },
    ".recent .tools": {
      position: "relative",
      display: "flex",
      flexDirection: "row",
      gap: "1em",
      marginTop: "2em"
    },
    ".recent h4": { margin: "0" },
    ".recent .items": { height: "100%", position: "relative" },
    ".workflow-buttons": {
      display: "flex",
      flexDirection: "row",
      gap: "1em",
      justifyContent: "center",
      marginLeft: "6em",
      alignItems: "center"
    }
  });

const listStyles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      margin: "0",
      padding: "0 0 2em 0",
      height: "90%",
      overflow: "hidden auto"
    },
    ".workflow": {
      position: "relative",
      display: "flex",
      flexDirection: "row",
      gap: "1em",
      alignItems: "flex-start",
      margin: ".25em 0",
      padding: "0.4em .5em",
      width: "calc(100% - 20px)",
      cursor: "pointer",
      borderBottom: "1px solid black",
      backgroundColor: theme.vars.palette.grey[800],
      transition: "background-color 0.2s ease-in-out"
    },
    ".workflow:hover": {
      backgroundColor: theme.vars.palette.grey[600],
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
      color: theme.vars.palette.grey[0]
    },
    ".description": {
      margin: "0.1em 0 .1em",
      color: theme.vars.palette.grey[200],
      fontSize: theme.fontSizeSmaller,
      paddingTop: "0.5em"
    },
    ".right": {
      display: "flex",
      flexDirection: "column",
      gap: "0.2em",
      justifyContent: "flex-start",
      alignItems: "flex-start",
      minWidth: "220px",
      marginLeft: "auto"
    },
    ".date": {
      marginLeft: "auto",
      paddingRight: "1em",
      fontSize: theme.fontSizeSmall,
      fontFamily: theme.fontFamily2,
      wordSpacing: "-2px",
      textAlign: "right",
      right: "0",
      color: theme.vars.palette.grey[100],
      minWidth: "150px"
    },
    ".date.relative": {
      color: theme.vars.palette.grey[200]
    },
    ".image-wrapper": {
      flexShrink: 0,
      width: "40px",
      height: "40px",
      overflow: "hidden",
      position: "relative",
      backgroundColor: theme.vars.palette.grey[500]
    }
  });

const OpenOrCreateDialog = () => {
  const theme = useTheme();
  const settings = useSettingsStore((state) => state.settings);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const setWorkflowOrder = useSettingsStore((state) => state.setWorkflowOrder);
  const createNewWorkflow = useWorkflowManager((state) => state.createNew);

  function addBreaks(text: string) {
    return escapeHtml(text).replace(/([-_.])/g, "$1<wbr>");
  }
  const loadWorkflows = async (cursor?: string, limit?: number) => {
    cursor = cursor || "";
    const { data, error } = await client.GET("/api/workflows/", {
      params: {
        query: { cursor, limit, columns: "name,id,updated_at,description" }
      }
    });
    if (error) {
      throw createErrorMessage(error, "Failed to load workflows");
    }
    return data;
  };
  // LOAD WORKFLOWS
  const { data, isLoading, error, isError } = useQuery<WorkflowList, Error>({
    queryKey: ["workflows"],
    queryFn: async () => {
      return loadWorkflows("");
    }
  });

  // CREATE NEW WORKFLOW
  const handleCreateNewWorkflow = async () => {
    const workflow = await createNewWorkflow();
    queryClient.invalidateQueries({ queryKey: ["workflows"] });
    navigate(`/editor/${workflow.id}`);
  };

  // BROWSE WORKFLOWS
  const handleNavigateExampleWorkflows = () => {
    navigate("/examples");
  };

  const onClickWorkflow = useCallback(
    (workflow: Workflow) => {
      // setShouldAutoLayout(true);
      navigate("/editor/" + workflow.id);
    },
    [navigate]
  );

  // ORDER
  const handleOrderChange = (_: any, newOrder: any) => {
    if (newOrder !== null) {
      setWorkflowOrder(newOrder);
    }
  };

  const handleOpenHelp = useAppHeaderStore((state) => state.handleOpenHelp);

  const sortedWorkflows = useMemo(() =>
    data?.workflows?.sort((a, b) => {
      if (settings.workflowOrder === "name") {
        return a.name.localeCompare(b.name);
      }
      return b.updated_at.localeCompare(a.updated_at);
    }),
    [data?.workflows, settings.workflowOrder]
  );

  // (a, b) =>
  //   new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  // List view
  const renderListView = (workflows: any) => (
    <Box className="container list" css={listStyles(theme)}>
      {workflows.map((workflow: Workflow, index: number) => (
        <Box
          key={`${workflow.id}-${index}`}
          className="workflow list"
          onClick={() => onClickWorkflow(workflow)}
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
          <div className="right">
            <Typography className="date">
              {prettyDate(workflow.updated_at, "verbose", settings)}
            </Typography>
            <Typography className="date relative">
              {relativeTime(workflow.updated_at)}
            </Typography>
          </div>
        </Box>
      ))}
    </Box>
  );
  return (
    <Dialog
      css={styles(theme)}
      open={true}
      components={{
        Backdrop: () => null
      }}
      style={{ top: "100px" }}
    >
      <Typography className="title" variant="h4">
        NODE
        <br />
        TOOL
      </Typography>
      <DialogContent className="content">
        <div className="workflow-buttons">
          <BackToDashboardButton />
          <Button variant="outlined" onClick={handleCreateNewWorkflow}>
            Create New
          </Button>
          <Button color="primary" onClick={handleNavigateExampleWorkflows}>
            Templates
          </Button>
          <Button color="primary" onClick={handleOpenHelp}>
            Shortcuts
          </Button>
        </div>

        <div className="recent">
          <div className="tools">
            <Typography className="recent-hl">Recent Workflows</Typography>
            <ToggleButtonGroup
              className="toggle-name-date"
              value={settings.workflowOrder}
              onChange={handleOrderChange}
              exclusive
              aria-label="Sort workflows"
            >
              <ToggleButton value="name" aria-label="Sort by name">
                Name
              </ToggleButton>
              <ToggleButton value="updated_at" aria-label="sort by date">
                Date
              </ToggleButton>
            </ToggleButtonGroup>
          </div>
          <div className="items">
            {isLoading && (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  width: "100%",
                  mt: 2
                }}
              >
                <CircularProgress />
              </Box>
            )}
            {isError && (
              <ErrorOutlineRounded>
                ERROR
                <Typography>{error?.message}</Typography>
              </ErrorOutlineRounded>
            )}
            {data && renderListView(sortedWorkflows)}
          </div>
        </div>
      </DialogContent>
      <Typography
        variant="body2"
        style={{
          color: "var(--palette-text-secondary)",
          marginTop: "2em",
          fontSize: theme.fontSizeSmaller
        }}
      >
        NODETOOL {VERSION}
      </Typography>
    </Dialog>
  );
};

export default memo(OpenOrCreateDialog);
