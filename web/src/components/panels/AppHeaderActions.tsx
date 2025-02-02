/** @jsxImportSource @emotion/react */
import { Button, Tooltip, CircularProgress, Box } from "@mui/material";
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
    "&": {
      position: "absolute",
      top: "-70px",
      zIndex: 10000
    },
    "&.actions": {
      fontSize: "12px",
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: "0.25em",
      backgroundColor: "transparent",
      margin: "0",
      padding: "0 1em",
      width: "100%"
    },
    ".status-message-container": {
      alignItems: "center",
      width: "300px"
    },
    ".action-button": {
      flexShrink: 0,
      height: "32px",
      width: "32px",
      minWidth: "32px",
      padding: "4px",
      color: theme.palette.c_gray6,
      position: "relative",
      borderRadius: "4px",
      "&:hover": {
        backgroundColor: theme.palette.c_gray2
      },
      "& svg": {
        fontSize: "20px",
        marginRight: "0",
        transition: "transform 0.1s ease"
      },
      "&:hover svg": {
        transform: "scale(1.1)"
      }
    },
    ".action-button.disabled": {
      color: theme.palette.c_gray4,
      "&:hover": {
        boxShadow: "none"
      }
    },
    ".run-stop-button": {
      backgroundColor: `${theme.palette.c_gray2}cc`,
      color: theme.palette.c_hl1,
      minWidth: "40px",
      height: "24px",
      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      "&:hover": {
        // boxShadow: `0 4px 20px ${theme.palette.c_hl1}40`
      },
      "&.disabled": {
        opacity: 0.5
      }
    },
    ".stop-workflow": {
      marginRight: "0.7em"
    },
    ".run-status": {
      position: "absolute",
      top: "-22px",
      fontSize: theme.fontSizeSmaller,
      padding: "0.2em 0.8em",
      borderRadius: "5px",
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

// Create individual button components
const CreateWorkflowButton = memo(() => {
  const createNewWorkflow = useWorkflowStore((state) => state.createNew);
  const navigate = useNavigate();

  const handleCreate = useCallback(async () => {
    const workflow = await createNewWorkflow();
    navigate(`/editor/${workflow.id}`);
  }, [createNewWorkflow, navigate]);

  return (
    <Tooltip title="Create new workflow" enterDelay={TOOLTIP_ENTER_DELAY}>
      <Button className="action-button" onClick={handleCreate} tabIndex={-1}>
        <NoteAddIcon />
      </Button>
    </Tooltip>
  );
});

const SaveWorkflowButton = memo(() => {
  const { saveWorkflow } = useNodes((state) => ({
    saveWorkflow: state.saveWorkflow
  }));
  const addNotification = useNotificationStore(
    (state) => state.addNotification
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

  return (
    <Tooltip title="Save workflow" enterDelay={TOOLTIP_ENTER_DELAY}>
      <Button
        className="action-button"
        onClick={() => saveWorkflow().then(onWorkflowSaved)}
        tabIndex={-1}
      >
        <SaveIcon />
      </Button>
    </Tooltip>
  );
});

const AutoLayoutButton = memo(({ autoLayout }: { autoLayout: () => void }) => (
  <Tooltip
    title="Arranges all nodes or selected nodes"
    enterDelay={TOOLTIP_ENTER_DELAY}
  >
    <Button className="action-button" onClick={autoLayout} tabIndex={-1}>
      <LayoutIcon />
    </Button>
  </Tooltip>
));

const RunWorkflowButton = memo(() => {
  const { workflow, nodes, edges } = useNodes((state) => ({
    workflow: state.workflow,
    nodes: state.nodes,
    edges: state.edges
  }));
  const { run, state, isWorkflowRunning } = useWorkflowRunner((state) => ({
    run: state.run,
    state: state.state,
    isWorkflowRunning: state.state === "running"
  }));

  useGlobalHotkeys(() => run({}, workflow, nodes, edges));

  return (
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
          <span style={{ fontSize: ".9em", color: "white" }}>CTRL+Enter</span>
        </div>
      }
      enterDelay={TOOLTIP_ENTER_DELAY}
    >
      <Button
        size="large"
        className={`action-button run-stop-button run-workflow ${
          isWorkflowRunning ? "disabled" : ""
        }`}
        onClick={() => !isWorkflowRunning && run({}, workflow, nodes, edges)}
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
          <CircularProgress size={20} />
        ) : (
          <PlayArrow />
        )}
      </Button>
    </Tooltip>
  );
});

const StopWorkflowButton = memo(() => {
  const { isWorkflowRunning, cancel } = useWorkflowRunner((state) => ({
    isWorkflowRunning: state.state === "running",
    cancel: state.cancel
  }));
  return (
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
        onClick={() => cancel()}
        tabIndex={-1}
      >
        <StopIcon />
      </Button>
    </Tooltip>
  );
});

const RunAsAppButton = memo(() => {
  const location = useLocation();
  const workflowId = location.pathname.split("/").pop();

  const handleRunAsApp = useCallback(() => {
    if (workflowId) {
      if (window.api) {
        window.api.runApp(workflowId);
      } else {
        window.open(
          "http://localhost:5173/index.html?workflow_id=" + workflowId,
          "_blank"
        );
      }
    }
  }, [workflowId]);

  return (
    <Tooltip title="Run as App" enterDelay={TOOLTIP_ENTER_DELAY}>
      <Button className="action-button" onClick={handleRunAsApp} tabIndex={-1}>
        <RocketLaunchIcon />
      </Button>
    </Tooltip>
  );
});

const AppHeaderActions: React.FC = () => {
  const openNodeMenu = useNodeMenuStore((state) => state.openNodeMenu);
  const path = useLocation().pathname;
  const buttonAppearance = useSettingsStore(
    (state) => state.settings.buttonAppearance
  );
  const { autoLayout } = useNodes((state) => ({
    autoLayout: state.autoLayout
  }));

  useCombo(["Ctrl+Space"], () =>
    openNodeMenu({
      x: 400,
      y: 200
    })
  );

  return (
    <>
      <Box sx={{ flexGrow: 1 }} />
      {path.startsWith("/editor") && (
        <div
          className="actions"
          css={actionsStyles(ThemeNodetool, buttonAppearance)}
        >
          <>
            <CreateWorkflowButton />
            <SaveWorkflowButton />
            <AutoLayoutButton autoLayout={autoLayout} />
            <RunWorkflowButton />
            <StopWorkflowButton />
            <RunAsAppButton />
          </>
        </div>
      )}
    </>
  );
};

export default memo(AppHeaderActions, isEqual);
