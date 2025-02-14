/** @jsxImportSource @emotion/react */
import { Button, Tooltip, CircularProgress, Box } from "@mui/material";
import LayoutIcon from "@mui/icons-material/ViewModule";
import SaveIcon from "@mui/icons-material/Save";
import NoteAddIcon from "@mui/icons-material/NoteAdd";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import EditIcon from "@mui/icons-material/Edit";

import PlayArrow from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { css } from "@emotion/react";
import { useLocation } from "react-router-dom";
import { memo, useCallback, useEffect } from "react";
import { useNotificationStore } from "../../stores/NotificationStore";
import useWorkflowRunner from "../../stores/WorkflowRunner";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { useCombo } from "../../stores/KeyPressedStore";
import { isEqual } from "lodash";
import { useNodes } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import ControlPointIcon from "@mui/icons-material/ControlPoint";
import { Workflow } from "../../stores/ApiTypes";

const styles = (theme: any) =>
  css({
    "&": {
      position: "absolute",
      top: "8px",
      left: "50%",
      transform: "translateX(-50%)",
      backgroundColor: theme.palette.c_gray1
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
      padding: "0 1em"
    },
    ".status-message-container": {
      alignItems: "center",
      width: "300px"
    },
    ".action-button": {
      flexShrink: 0,
      width: "32px",
      height: "24px",
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
    ".action-button.active": {
      border: `1px solid ${theme.palette.c_hl1}66`
    },
    ".action-button.disabled": {
      color: theme.palette.c_gray4,
      "&:hover": {
        boxShadow: "none"
      }
    },
    ".node-menu-button": {
      "& svg": {
        fill: `${theme.palette.c_hl1}cc`
      },
      "&:hover svg": {
        fill: `${theme.palette.c_hl1}ff`
      }
    },
    ".run-stop-button": {
      backgroundColor: `${theme.palette.c_gray2}cc`,
      color: theme.palette.c_hl1,
      minWidth: "40px",
      "&:hover": {
        boxShadow: `0 0 10px ${theme.palette.c_hl1}cc`,
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
      },
      "&.disabled": {
        opacity: 0.5
      },
      "&.running": {
        "& svg": {
          animation:
            "spin 2s linear infinite, rainbow-rotate 3s linear infinite",
          color: theme.palette.c_hl1
        }
      }
    },
    ".stop-workflow": {
      marginRight: "0.7em"
    },
    ".run-status": {
      position: "absolute",
      top: "25px",
      fontSize: theme.fontSizeSmaller,
      padding: "0.2em 0.8em",
      color: theme.palette.c_gray6,
      boxShadow: `0 2px 8px ${theme.palette.c_gray1}40`
    },
    ".tooltip-span": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "0.1em"
    },
    ".tooltip-title": {
      fontSize: "1.2em",
      color: theme.palette.c_gray6
    },
    ".tooltip-key": {
      fontSize: "0.8em",
      color: theme.palette.c_gray6
    },
    "@keyframes pulse": {
      "0%": { opacity: 0.4 },
      "50%": { opacity: 1 },
      "100%": { opacity: 0.4 }
    },
    ".connecting-status": {
      animation: "pulse 1.5s infinite ease-in-out",
      color: theme.palette.c_hl1
    },
    "@keyframes rainbow-rotate": {
      "0%": { filter: "hue-rotate(0deg)" },
      "100%": { filter: "hue-rotate(360deg)" }
    },
    "@keyframes spin": {
      "0%": { transform: "rotate(0deg)" },
      "100%": { transform: "rotate(360deg)" }
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

const NodeMenuButton = memo(function NodeMenuButton() {
  const { openNodeMenu, closeNodeMenu, isMenuOpen } = useNodeMenuStore(
    (state) => ({
      openNodeMenu: state.openNodeMenu,
      closeNodeMenu: state.closeNodeMenu,
      isMenuOpen: state.isMenuOpen
    })
  );

  const handleToggleNodeMenu = useCallback(() => {
    if (isMenuOpen) {
      closeNodeMenu();
    } else {
      openNodeMenu({
        x: 400,
        y: 200
      });
    }
  }, [isMenuOpen, openNodeMenu, closeNodeMenu]);

  return (
    <Tooltip title="Toggle Node Menu" enterDelay={TOOLTIP_ENTER_DELAY}>
      <Button
        className={`action-button node-menu-button ${
          isMenuOpen ? "active" : ""
        }`}
        onClick={handleToggleNodeMenu}
        tabIndex={-1}
      >
        <ControlPointIcon />
      </Button>
    </Tooltip>
  );
});

const SaveWorkflowButton = memo(function SaveWorkflowButton() {
  const { saveWorkflow, getCurrentWorkflow } = useWorkflowManager((state) => ({
    saveWorkflow: state.saveWorkflow,
    getCurrentWorkflow: state.getCurrentWorkflow
  }));
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const handleSave = useCallback(async () => {
    const workflow = getCurrentWorkflow();
    if (workflow) {
      await saveWorkflow(workflow);
      addNotification({
        content: `Workflow ${workflow.name} saved`,
        type: "success",
        alert: true
      });
    }
  }, [saveWorkflow, getCurrentWorkflow, addNotification]);

  useCombo(["Alt+s"], handleSave);
  useCombo(["Meta+s"], handleSave);

  return (
    <Tooltip title="Save workflow" enterDelay={TOOLTIP_ENTER_DELAY}>
      <Button className="action-button" onClick={handleSave} tabIndex={-1}>
        <SaveIcon />
      </Button>
    </Tooltip>
  );
});

const AutoLayoutButton = memo(function AutoLayoutButton({
  autoLayout
}: {
  autoLayout: () => void;
}) {
  return (
    <Tooltip
      title="Arranges all nodes or selected nodes"
      enterDelay={TOOLTIP_ENTER_DELAY}
    >
      <Button className="action-button" onClick={autoLayout} tabIndex={-1}>
        <LayoutIcon />
      </Button>
    </Tooltip>
  );
});

const RunWorkflowButton = memo(function RunWorkflowButton() {
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

  const { getWorkflow, saveWorkflow } = useWorkflowManager((state) => ({
    getWorkflow: state.getWorkflow,
    saveWorkflow: state.saveWorkflow
  }));

  const handleRun = useCallback(() => {
    if (!isWorkflowRunning) {
      run({}, workflow, nodes, edges);
    }
    setTimeout(() => {
      const w = getWorkflow(workflow.id);
      if (w) {
        saveWorkflow(w);
      }
    }, 100);
  }, [
    isWorkflowRunning,
    run,
    workflow,
    nodes,
    edges,
    getWorkflow,
    saveWorkflow
  ]);

  useGlobalHotkeys(handleRun);

  return (
    <Tooltip
      title={
        <div className="tooltip-span">
          <div className="tooltip-title">Run Workflow</div>
          <div className="tooltip-key">CTRL+Enter</div>
        </div>
      }
      enterDelay={TOOLTIP_ENTER_DELAY}
    >
      <Button
        size="large"
        className={`action-button run-stop-button run-workflow ${
          isWorkflowRunning ? "running" : ""
        }`}
        onClick={handleRun}
        disabled={isWorkflowRunning}
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
        ) : isWorkflowRunning ? (
          <CircularProgress size={20} color="inherit" />
        ) : (
          <PlayArrow />
        )}
      </Button>
    </Tooltip>
  );
});

const StopWorkflowButton = memo(function StopWorkflowButton() {
  const { isWorkflowRunning, cancel } = useWorkflowRunner((state) => ({
    isWorkflowRunning: state.state === "running",
    cancel: state.cancel
  }));
  return (
    <Tooltip
      title={
        <div className="tooltip-span">
          <div className="tooltip-title">Stop Workflow</div>
          <div className="tooltip-key">ESC</div>
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

const RunAsAppButton = memo(function RunAsAppButton() {
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

const EditWorkflowButton = memo(function EditWorkflowButton({
  setWorkflowToEdit
}: {
  setWorkflowToEdit: (workflow: Workflow) => void;
}) {
  const { getWorkflow } = useNodes((state) => ({
    getWorkflow: state.getWorkflow
  }));

  return (
    <>
      <Tooltip title="Edit Workflow Settings" enterDelay={TOOLTIP_ENTER_DELAY}>
        <Button
          className="action-button"
          onClick={() => setWorkflowToEdit(getWorkflow())}
          tabIndex={-1}
        >
          <EditIcon />
        </Button>
      </Tooltip>
    </>
  );
});

interface AppHeaderActionsProps {
  setWorkflowToEdit: (workflow: Workflow) => void;
}

const AppHeaderActions: React.FC<AppHeaderActionsProps> = ({
  setWorkflowToEdit
}) => {
  const openNodeMenu = useNodeMenuStore((state) => state.openNodeMenu);
  const path = useLocation().pathname;
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
        <div className="actions" css={styles}>
          <>
            <NodeMenuButton />
            <EditWorkflowButton setWorkflowToEdit={setWorkflowToEdit} />
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
