/** @jsxImportSource @emotion/react */
import {
  Button,
  Tooltip,
  CircularProgress,
  Box,
  Typography
} from "@mui/material";
import NodesIcon from "@mui/icons-material/CircleOutlined";
import LayoutIcon from "@mui/icons-material/ViewModule";
import SaveIcon from "@mui/icons-material/Save";
import NoteAddIcon from "@mui/icons-material/NoteAdd";

import PlayArrow from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import { TOOLTIP_DELAY } from "../../config/constants";
import { css } from "@emotion/react";
import { useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useNodeStore } from "../../stores/NodeStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { Workflow } from "../../stores/ApiTypes";
import useWorkflowRunner from "../../stores/WorkflowRunner";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { useAppHeaderStore } from "../../stores/AppHeaderStore";
import ThemeNodetool from "../themes/ThemeNodetool";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useWorkflowStore } from "../../stores/WorkflowStore";

const actionsStyles = (
  theme: any,
  buttonAppearance: "text" | "icon" | "both"
) =>
  css({
    "&.actions": {
      position: "fixed",
      zIndex: 1000,
      height: "40px",
      top: "50px",
      left: "50%",
      transform: "translateX(-50%)",
      display: "flex",
      flexDirection: "row",
      justifyContent: "flex-start",
      alignItems: "center",
      gap: "0.5em",
      backgroundColor: theme.palette.c_gray1,
      borderRadius: "0 0 .5em 0.5em",
      margin: "-.25em 0 0",
      padding: "0 .5em .2em .5em"
    },
    ".action-button": {
      flexShrink: 0,
      minWidth: "6em",
      height: "2em",
      padding: "0 1em",
      backgroundColor: theme.palette.c_gray2,
      fontSize:
        buttonAppearance === "text" || buttonAppearance === "both"
          ? theme.fontSizeSmaller
          : "0",
      color: theme.palette.c_gray6,
      "&:hover": {
        backgroundColor: theme.palette.c_gray2
      }
    },
    ".action-button:hover": {
      color: theme.palette.c_hl1
    },
    ".action-button.disabled": {
      color: theme.palette.c_gray4
    },
    ".divider": {
      display: "inline-block",
      width: ".2em",
      color: theme.palette.c_gray4,
      padding: "0 .1em"
    },
    ".run-stop-button": {
      backgroundColor: theme.palette.c_gray2,
      color: theme.palette.c_hl1,
      padding: "0.1em 1em",
      minWidth: "5em"
    },
    ".run-stop-button svg": {
      padding: "0",
      width: "100%",
      height: "100%",
      minWidth: "1.2em",
      minHeight: "1.2em",
      display: "block"
    },
    ".MuiCircularProgress-root": {
      width: "20px !important",
      height: "20px !important"
    },
    ".run-status": {
      position: "absolute",
      top: "-20px",
      fontSize: theme.fontSizeSmaller,
      padding: "0 .5em",
      borderRadius: ".5em",
      color: theme.palette.c_gray6,
      backgroundColor: theme.palette.c_gray1
    },
    "@keyframes pulse": {
      "0%": { opacity: 0.1 },
      "50%": { opacity: 1 },
      "100%": { opacity: 0.1 }
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

export default function AppHeaderActions() {
  const openNodeMenu = useNodeMenuStore((state) => state.openNodeMenu);
  const autoLayout = useNodeStore((state) => state.autoLayout);
  const saveWorkflow = useNodeStore((state) => state.saveWorkflow);
  const createNewWorkflow = useWorkflowStore((state) => state.createNew);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const navigate = useNavigate();
  const runWorkflow = useWorkflowRunner((state) => state.run);
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

  const handleCreateWorkflow = useCallback(async () => {
    const workflow = await createNewWorkflow();
    navigate(`/editor/${workflow.id}`);
  }, [createNewWorkflow, navigate]);

  useHotkeys("Alt+s", () => saveWorkflow().then(onWorkflowSaved));
  useHotkeys("Meta+s", () => saveWorkflow().then(onWorkflowSaved), {
    preventDefault: true
  });
  useHotkeys("Ctrl+Space", () => openNodeMenu(400, 200));

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
            <Tooltip title="Create new workflow" enterDelay={TOOLTIP_DELAY}>
              <Button className="action-button" onClick={handleCreateWorkflow}>
                <NoteAddIcon />
                New
              </Button>
            </Tooltip>

            <Tooltip
              title={
                <>
                  <span
                    style={{
                      fontSize: "1.2em",
                      color: "white",
                      textAlign: "center",
                      display: "block"
                    }}
                  >
                    Open NodeMenu
                  </span>
                  <span
                    style={{
                      fontSize: "1em",
                      color: "white",
                      textAlign: "center",
                      display: "block"
                    }}
                  >
                    Ctrl+Space
                    <br /> Double Click on Canvas
                  </span>
                </>
              }
              enterDelay={TOOLTIP_DELAY}
            >
              <Button
                className="action-button"
                onClick={() => openNodeMenu(400, 200)}
              >
                <NodesIcon />
                Nodes
              </Button>
            </Tooltip>

            <Tooltip
              title="Arranges all nodes or selected nodes"
              enterDelay={TOOLTIP_DELAY}
            >
              <Button className="action-button" onClick={autoLayout}>
                <LayoutIcon />
                Layout
              </Button>
            </Tooltip>

            <Tooltip title="Save workflow" enterDelay={TOOLTIP_DELAY}>
              <Button
                className="action-button"
                onClick={() => saveWorkflow().then(onWorkflowSaved)}
              >
                <SaveIcon />
                Save
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
              enterDelay={TOOLTIP_DELAY}
            >
              <Button
                size="large"
                className={`action-button run-stop-button run-workflow ${
                  isWorkflowRunning ? "disabled" : ""
                }`}
                onClick={() => !isWorkflowRunning && runWorkflow()}
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
              enterDelay={TOOLTIP_DELAY}
            >
              <Button
                size="large"
                className={`action-button run-stop-button stop-workflow ${
                  !isWorkflowRunning ? "disabled" : ""
                }`}
                onClick={() => cancelWorkflow()}
              >
                <StopIcon />
              </Button>
            </Tooltip>
          </>
        </div>
      )}
    </>
  );
}
