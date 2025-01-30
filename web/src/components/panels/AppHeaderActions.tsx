/** @jsxImportSource @emotion/react */
import {
  Button,
  Tooltip,
  CircularProgress,
  Box,
  Typography
} from "@mui/material";
import LayoutIcon from "@mui/icons-material/ViewModule";
import SaveIcon from "@mui/icons-material/Save";
import NoteAddIcon from "@mui/icons-material/NoteAdd";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";

import PlayArrow from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { css } from "@emotion/react";
import { useLocation, useNavigate } from "react-router-dom";
import { memo, useCallback, useEffect } from "react";
import { useNotificationStore } from "../../stores/NotificationStore";
import { Workflow } from "../../stores/ApiTypes";
import useWorkflowRunner from "../../stores/WorkflowRunner";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import ThemeNodetool from "../themes/ThemeNodetool";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useWorkflowStore } from "../../stores/WorkflowStore";
import { useCombo } from "../../stores/KeyPressedStore";
import { isEqual } from "lodash";
import { useNodes } from "../../contexts/NodeContext";

const actionsStyles = (
  theme: any,
  buttonAppearance: "text" | "icon" | "both"
) =>
  css({
    "&.actions": {
      position: "relative",
      zIndex: 1000,
      height: "48px",
      display: "flex",
      flexDirection: "row",
      justifyContent: "flex-start",
      alignItems: "center",
      gap: "0.5em",
      backgroundColor: "transparent",
      margin: "0",
      padding: "0 2em"
    },
    ".action-button": {
      flexShrink: 0,
      minWidth: "2.4em",
      height: "2.4em",
      padding: "0.8em",
      backgroundColor: `${theme.palette.c_gray2}99`,
      color: theme.palette.c_gray6,
      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      position: "relative",
      borderRadius: "8px",
      "&:before": {
        content: '""',
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: "8px",
        opacity: 0,
        transition: "opacity 0.2s ease-in-out",
        background: `radial-gradient(circle at center, ${theme.palette.c_hl1}40 0%, transparent 70%)`,
        pointerEvents: "none"
      },
      "&:hover": {
        backgroundColor: theme.palette.c_gray2,
        transform: "translateY(-2px)",
        boxShadow: `0 4px 15px ${theme.palette.c_hl1}33`,
        "&:before": {
          opacity: 1
        }
      },
      "& svg": {
        fontSize: "2.2em",
        transition: "transform 0.2s ease"
      },
      "&:hover svg": {
        transform: "scale(1.1)"
      }
    },
    ".action-button.disabled": {
      color: theme.palette.c_gray4,
      "&:hover": {
        transform: "none",
        boxShadow: "none",
        "&:before": {
          opacity: 0
        }
      }
    },
    ".run-stop-button": {
      backgroundColor: `${theme.palette.c_gray2}cc`,
      color: theme.palette.c_hl1,
      padding: "1em",
      minWidth: "6em",
      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      "&:hover": {
        transform: "translateY(-2px)",
        boxShadow: `0 4px 20px ${theme.palette.c_hl1}40`
      },
      "&.disabled": {
        opacity: 0.5
      }
    },
    ".run-status": {
      position: "absolute",
      top: "-22px",
      fontSize: theme.fontSizeSmaller,
      padding: "0.2em 0.8em",
      borderRadius: "6px",
      color: theme.palette.c_gray6,
      backgroundColor: `${theme.palette.c_gray1}ee`,
      backdropFilter: "blur(4px)",
      boxShadow: `0 2px 8px ${theme.palette.c_gray1}40`
    },
    "@keyframes pulse": {
      "0%": { opacity: 0.4 },
      "50%": { opacity: 1 },
      "100%": { opacity: 0.4 }
    },
    ".connecting-status": {
      animation: "pulse 1.5s infinite ease-in-out",
      color: theme.palette.c_hl1
    }
  });

// Custom hook for global hotkeys
const useGlobalHotkeys = (callback: () => void) => {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        callback();
      }
    },
    [callback]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
};

const AppHeaderActions: React.FC = () => {
  const openNodeMenu = useNodeMenuStore((state) => state.openNodeMenu);
  const { autoLayout, saveWorkflow } = useNodes((state) => ({
    autoLayout: state.autoLayout,
    saveWorkflow: state.saveWorkflow
  }));
  const createNewWorkflow = useWorkflowStore((state) => state.createNew);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const navigate = useNavigate();
  const run = useWorkflowRunner((state) => state.run);
  const { nodes, edges, workflow } = useNodes((state) => ({
    nodes: state.nodes,
    edges: state.edges,
    workflow: state.workflow
  }));
  const runWorkflow = useCallback(() => {
    run({}, workflow, nodes, edges);
  }, [run, workflow, nodes, edges]);
  const cancelWorkflow = useWorkflowRunner((state) => state.cancel);
  const state = useWorkflowRunner((state) => state.state);
  const path = useLocation().pathname;
  const statusMessage = useWorkflowRunner((state) => state.statusMessage);
  const isWorkflowRunning = useWorkflowRunner(
    (state) => state.state === "running"
  );
  const buttonAppearance = useSettingsStore(
    (state) => state.settings.buttonAppearance
  );
  const onWorkflowSaved = useCallback(
    (workflow: Workflow) => {
      addNotification({
        content: `Workflow ${workflow.name} saved`,
        type: "success",
        alert: true
      });
    },
    [addNotification]
  );
  const workflowId = path.split("/").pop();

  const handleCreateWorkflow = useCallback(async () => {
    const workflow = await createNewWorkflow();
    navigate(`/editor/${workflow.id}`);
  }, [createNewWorkflow, navigate]);

  const handleRunAsApp = useCallback(() => {
    if (workflowId) {
      // In electron, we can use the api to run the app
      if (window.api) {
        window.api.runApp(workflowId);
      } else {
        // In web, we can open a new window
        window.open(
          "http://localhost:5173/index.html?workflow_id=" + workflowId,
          "_blank"
        );
      }
    }
  }, [workflowId]);

  useCombo(
    ["Alt+s"],
    useCallback(
      () => saveWorkflow().then(onWorkflowSaved),
      [saveWorkflow, onWorkflowSaved]
    )
  );
  useCombo(
    ["Meta+s"],
    useCallback(
      () => saveWorkflow().then(onWorkflowSaved),
      [saveWorkflow, onWorkflowSaved]
    )
  );
  useCombo(["Ctrl+Space"], () => openNodeMenu(400, 200));

  useGlobalHotkeys(runWorkflow);

  return (
    <>
      <Box sx={{ flexGrow: 1 }} />
      {isWorkflowRunning && (
        <Typography
          className="status-message"
          variant="caption"
          color="inherit"
        >
          {statusMessage || ""}
        </Typography>
      )}
      {path.startsWith("/editor") && (
        <div
          className="actions"
          css={actionsStyles(ThemeNodetool, buttonAppearance)}
        >
          <>
            <Tooltip
              title="Create new workflow"
              enterDelay={TOOLTIP_ENTER_DELAY}
            >
              <Button
                className="action-button"
                onClick={handleCreateWorkflow}
                tabIndex={-1}
              >
                <NoteAddIcon />
              </Button>
            </Tooltip>

            <Tooltip title="Save workflow" enterDelay={TOOLTIP_ENTER_DELAY}>
              <Button
                className="action-button"
                onClick={() => saveWorkflow().then(onWorkflowSaved)}
                tabIndex={-1}
              >
                <SaveIcon />
              </Button>
            </Tooltip>

            <Tooltip
              title="Arranges all nodes or selected nodes"
              enterDelay={TOOLTIP_ENTER_DELAY}
            >
              <Button
                className="action-button"
                onClick={autoLayout}
                tabIndex={-1}
              >
                <LayoutIcon />
              </Button>
            </Tooltip>

            <Tooltip
              title={
                <div
                  className="tooltip-span"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "0.1em"
                  }}
                >
                  <span style={{ fontSize: "1.2em", color: "white" }}>
                    Run Workflow
                  </span>
                  <span style={{ fontSize: ".9em", color: "white" }}>
                    CTRL+Enter
                  </span>
                </div>
              }
              enterDelay={TOOLTIP_ENTER_DELAY}
            >
              <Button
                size="large"
                className={`action-button run-stop-button run-workflow ${
                  isWorkflowRunning ? "disabled" : ""
                }`}
                onClick={() => !isWorkflowRunning && runWorkflow()}
                tabIndex={-1}
              >
                {state === "connecting" || state === "connected" ? (
                  <>
                    <span
                      className={`run-status ${
                        state === "connecting" ? "connecting-status" : ""
                      }`}
                    >
                      {state === "connecting" ? "Connecting" : "Connected"}
                    </span>
                    <PlayArrow />
                  </>
                ) : state === "running" ? (
                  <CircularProgress />
                ) : (
                  <PlayArrow />
                )}
              </Button>
            </Tooltip>

            <Tooltip
              title={
                <div
                  className="tooltip-span"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "0.1em"
                  }}
                >
                  <span style={{ fontSize: "1.2em", color: "white" }}>
                    Stop Workflow
                  </span>
                  <span style={{ fontSize: "1em", color: "white" }}>ESC</span>
                </div>
              }
              enterDelay={TOOLTIP_ENTER_DELAY}
            >
              <Button
                size="large"
                className={`action-button run-stop-button stop-workflow ${
                  !isWorkflowRunning ? "disabled" : ""
                }`}
                onClick={() => cancelWorkflow()}
                tabIndex={-1}
              >
                <StopIcon />
              </Button>
            </Tooltip>

            <Tooltip title="Run as App" enterDelay={TOOLTIP_ENTER_DELAY}>
              <Button
                className="action-button"
                onClick={handleRunAsApp}
                tabIndex={-1}
              >
                <RocketLaunchIcon />
              </Button>
            </Tooltip>
          </>
        </div>
      )}
    </>
  );
};

export default memo(AppHeaderActions, isEqual);
