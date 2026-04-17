/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo } from "react";
import { Box } from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Workflow, WorkflowList } from "../../stores/ApiTypes";

import {
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  Text,
  ToggleGroup,
  ToggleOption,
  type ToggleGroupProps
} from "../ui_primitives";
import { ErrorOutlineRounded } from "@mui/icons-material";
import { prettyDate, relativeTime } from "../../utils/formatDateAndTime";
import { truncateString } from "../../utils/truncateString";
import { useNavigate } from "react-router";
import { useSettingsStore } from "../../stores/SettingsStore";
import { VERSION } from "../../config/constants";
import { useAppHeaderStore } from "../../stores/AppHeaderStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { trpcClient } from "../../trpc/client";
import BackToDashboardButton from "../dashboard/BackToDashboardButton";
import { addBreaks } from "../../utils/sanitize";
import { sanitizeImageUrl } from "../../utils/urlValidation";
const styles = (theme: Theme) =>
  css({
    ".MuiBackdrop-root": { background: "transparent" },
    ".MuiPaper-root": {
      width: "70vw",
      height: "70vh",
      maxWidth: "1000px",
      maxHeight: "800px",
      padding: "2em",
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
      paddingRight: "3em"
    },
    ".recent": {
      position: "relative",
      flexGrow: 1,
      height: "75%",
      width: "100%"
    },
    ".recent .tools": {
      position: "relative",
      marginTop: "2em"
    },
    ".recent h4": { margin: "0" },
    ".recent .items": { height: "100%", position: "relative" },
    ".workflow-buttons": {
      justifyContent: "center",
      marginLeft: "6em",
      alignItems: "center"
    }
  });

const listStyles = (theme: Theme) =>
  css({
    "&": {
      alignItems: "flex-start",
      margin: "0",
      padding: "0 0 2em 0",
      height: "90%",
      overflow: "hidden auto"
    },
    ".workflow": {
      position: "relative",
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

  // LOAD WORKFLOWS
  const { data, isLoading, error, isError } = useQuery<WorkflowList, Error>({
    queryKey: ["workflows"],
    queryFn: async () => {
      return trpcClient.workflows.list.query({
        cursor: "",
        limit: 100
      }) as unknown as WorkflowList;
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

  // Use data attributes to avoid creating new function references on each render
  // This is more efficient than curried handlers which create new closures
  const handleWorkflowClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const workflowId = event.currentTarget.dataset.workflowId;
      if (workflowId) {
        navigate("/editor/" + workflowId);
      }
    },
    [navigate]
  );

  // ORDER
  const handleOrderChange: ToggleGroupProps["onChange"] = (_event, newOrder) => {
    if (newOrder !== null) {
      setWorkflowOrder(newOrder);
    }
  };

  const handleOpenHelp = useAppHeaderStore((state) => state.handleOpenHelp);

  const sortedWorkflows = useMemo(() =>
    [...(data?.workflows || [])].sort((a, b) => {
      if (settings.workflowOrder === "name") {
        return a.name.localeCompare(b.name);
      }
      return b.updated_at.localeCompare(a.updated_at);
    }),
    [data?.workflows, settings.workflowOrder]
  );

  // Memoize workflow list items to prevent unnecessary re-renders
  const workflowListItems = useMemo(() =>
    sortedWorkflows.map((workflow: Workflow, index: number) => (
      <FlexRow
        key={`${workflow.id}-${index}`}
        className="workflow list"
        align="flex-start"
        gap={1}
        onClick={handleWorkflowClick}
        data-workflow-id={workflow.id}
        sx={{
          width: "calc(100% - 20px)",
          cursor: "pointer",
          borderBottom: "1px solid black",
          backgroundColor: theme.vars.palette.grey[800],
          transition: "background-color 0.2s ease-in-out",
          "&:hover": {
            backgroundColor: theme.vars.palette.grey[600],
            outline: 0
          }
        }}
      >
        <Box
          className="image-wrapper"
          sx={{
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundImage: sanitizeImageUrl(workflow.thumbnail_url)
              ? `url(${sanitizeImageUrl(workflow.thumbnail_url)})`
              : "none",
            width: "50px",
            height: "50px"
          }}
        >
          {!workflow.thumbnail_url && <Box className="image-placeholder" />}
        </Box>
        <FlexColumn className="name-and-description" sx={{ gap: "0.1em" }}>
          <div
            className="name"
            dangerouslySetInnerHTML={{ __html: addBreaks(workflow.name) }}
          ></div>
          <Text className="description">
            {truncateString(workflow.description, 350)}
          </Text>
        </FlexColumn>
        <FlexColumn
          className="right"
          sx={{
            gap: "0.2em",
            justifyContent: "flex-start",
            alignItems: "flex-start",
            minWidth: "220px",
            marginLeft: "auto"
          }}
        >
          <Text className="date">
            {prettyDate(workflow.updated_at, "verbose", settings)}
          </Text>
          <Text className="date relative">
            {relativeTime(workflow.updated_at)}
          </Text>
        </FlexColumn>
      </FlexRow>
    )),
    [sortedWorkflows, handleWorkflowClick, settings, theme]
  );

  // List view
  const renderListView = useCallback(() => (
    <FlexColumn className="container list" css={listStyles(theme)}>
      {workflowListItems}
    </FlexColumn>
  ), [workflowListItems, theme]);
  return (
    <Dialog
      css={styles(theme)}
      open={true}
      components={{
        Backdrop: () => null
      }}
      style={{ top: "100px" }}
    >
      <FlexColumn className="content" gap={1} sx={{ position: "relative", overflow: "hidden", margin: 0, padding: 0, alignItems: "flex-start" }}>
        <Text className="title" size="big">
          NODE
          <br />
          TOOL
        </Text>
        <FlexRow className="workflow-buttons" gap={1} justify="center" align="center" sx={{ marginLeft: "6em" }}>
          <BackToDashboardButton />
          <EditorButton variant="outlined" density="compact" onClick={handleCreateNewWorkflow}>
            Create New
          </EditorButton>
          <EditorButton color="primary" density="compact" onClick={handleNavigateExampleWorkflows}>
            Templates
          </EditorButton>
          <EditorButton color="primary" density="compact" onClick={handleOpenHelp}>
            Shortcuts
          </EditorButton>
        </FlexRow>

        <FlexColumn className="recent" gap={1} sx={{ flexGrow: 1, height: "75%", width: "100%", position: "relative" }}>
          <FlexRow className="tools" gap={1} sx={{ position: "relative", marginTop: "2em" }}>
            <Text className="recent-hl">Recent Workflows</Text>
            <ToggleGroup
              className="toggle-name-date"
              value={settings.workflowOrder}
              onChange={handleOrderChange}
              exclusive
              aria-label="Sort workflows"
            >
              <ToggleOption value="name" aria-label="Sort by name">
                Name
              </ToggleOption>
              <ToggleOption value="updated_at" aria-label="sort by date">
                Date
              </ToggleOption>
            </ToggleGroup>
          </FlexRow>
          <FlexColumn className="items" sx={{ height: "100%", position: "relative" }}>
            {isLoading && (
              <FlexRow justify="center" fullWidth sx={{ mt: 2 }}>
                <LoadingSpinner />
              </FlexRow>
            )}
            {isError && (
              <ErrorOutlineRounded>
                ERROR
                <Text>{error?.message}</Text>
              </ErrorOutlineRounded>
            )}
            {data && sortedWorkflows && renderListView()}
          </FlexColumn>
        </FlexColumn>
      <Text
        size="smaller"
        color="secondary"
        style={{
          marginTop: "2em"
        }}
        >
        NODETOOL {VERSION}
      </Text>
      </FlexColumn>
    </Dialog>
  );
};

export default memo(OpenOrCreateDialog);
