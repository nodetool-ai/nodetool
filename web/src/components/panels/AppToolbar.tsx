/** @jsxImportSource @emotion/react */
import {
  Button,
  Tooltip,
  CircularProgress,
  Box,
  MenuItem,
  Select,
  FormControl
} from "@mui/material";
import PlayArrow from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useLocation } from "react-router-dom";
import { memo, useCallback, useState } from "react";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { useCombo } from "../../stores/KeyPressedStore";
import isEqual from "lodash/isEqual";
import { useNodes, useNodeStoreRef } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { Workflow } from "../../stores/ApiTypes";
import { isLocalhost } from "../../stores/ApiClient";
import { getShortcutTooltip } from "../../config/shortcuts";
import { executeViaComfyUI } from "../../utils/comfyExecutor";
import { shallow } from "zustand/shallow";

// Icons
import LayoutIcon from "@mui/icons-material/ViewModule";
import SaveIcon from "@mui/icons-material/Save";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import EditIcon from "@mui/icons-material/Edit";
import ControlPointIcon from "@mui/icons-material/ControlPoint";
import DownloadIcon from "@mui/icons-material/Download";

const styles = (theme: Theme) =>
  css({
    "&": {
      position: "absolute",
      top: "4px",
      left: "50%",
      transform: "translateX(-50%)",
      backgroundColor: theme.vars.palette.grey[800]
    },
    ".dashboard-button": {
      position: "absolute",
      left: "-520px",
      top: "-8px",
      width: "48px",
      height: "40px",
      backgroundColor: `${theme.vars.palette.grey[800]}ee`,
      color: "var(--palette-primary-main)",
      border: `2px solid ${theme.vars.palette.grey[500]}`,
      borderRadius: "12px",
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      backdropFilter: "blur(10px)",
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[600],
        borderColor: "var(--palette-primary-main)",
        transform: "translateY(-2px) scale(1.05)",
        boxShadow: `0 8px 24px ${"var(--palette-primary-main)"}60, 0 0 40px ${"var(--palette-primary-main)"}30`,
        color: theme.vars.palette.grey[0]
      },
      "&:active": {
        transform: "translateY(0) scale(0.98)"
      },
      "& svg": {
        fontSize: "26px",
        filter: "drop-shadow(0 0 4px rgba(0,0,0,0.3))"
      },
      "&::before": {
        content: '""',
        position: "absolute",
        top: "-2px",
        left: "-2px",
        right: "-2px",
        bottom: "-2px",
        background: `linear-gradient(45deg, ${"var(--palette-primary-main)"}20, transparent, ${"var(--palette-secondary-main)"}20)`,
        borderRadius: "14px",
        opacity: 0,
        transition: "opacity 0.3s ease",
        zIndex: -1
      },
      "&:hover::before": {
        opacity: 1
      }
    },
    ".chat-button": {
      position: "absolute",
      left: "-580px",
      top: "-8px",
      width: "48px",
      height: "40px",
      backgroundColor: `${theme.vars.palette.grey[800]}ee`,
      color: "var(--palette-primary-main)",
      border: `2px solid ${theme.vars.palette.grey[500]}`,
      borderRadius: "12px",
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      backdropFilter: "blur(10px)",
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[600],
        borderColor: "var(--palette-primary-main)",
        transform: "translateY(-2px) scale(1.05)",
        boxShadow: `0 8px 24px ${"var(--palette-primary-main)"}60, 0 0 40px ${"var(--palette-primary-main)"}30`,
        color: theme.vars.palette.grey[0]
      },
      "&:active": {
        transform: "translateY(0) scale(0.98)"
      },
      "& svg": {
        fontSize: "26px",
        filter: "drop-shadow(0 0 4px rgba(0,0,0,0.3))"
      },
      "&::before": {
        content: '""',
        position: "absolute",
        top: "-2px",
        left: "-2px",
        right: "-2px",
        bottom: "-2px",
        background: `linear-gradient(45deg, ${"var(--palette-primary-main)"}20, transparent, ${"var(--palette-secondary-main)"}20)`,
        borderRadius: "14px",
        opacity: 0,
        transition: "opacity 0.3s ease",
        zIndex: -1
      },
      "&:hover::before": {
        opacity: 1
      }
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
    ".mode-select": {
      padding: "0",
      minWidth: "90px",
      margin: "0 0.5em",
      height: "24px",
      "& svg": {
        right: "2px"
      },
      "& .MuiInputBase-root": {
        height: "24px",
        minHeight: "24px"
      },
      "& .MuiSelect-select": {
        fontSize: "0.75rem",
        padding: "0px 8px",
        color: theme.vars.palette.grey[100],
        lineHeight: "24px",
        height: "24px"
      },
      "& .MuiOutlinedInput-notchedOutline": {
        borderColor: theme.vars.palette.grey[500]
      }
    },
    ".status-message-container": {
      alignItems: "center",
      width: "300px"
    },
    ".action-button": {
      flexShrink: 0,
      width: "32px",
      height: "32px",
      minWidth: "32px",
      padding: "4px",
      color: theme.vars.palette.grey[100],
      position: "relative",
      borderRadius: "4px",
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[600]
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
      border: `1px solid ${"var(--palette-primary-main)"}66`
    },
    ".action-button.disabled": {
      color: theme.vars.palette.grey[400],
      "&:hover": {
        boxShadow: "none"
      }
    },
    ".node-menu-button": {
      "& svg": {
        fill: `${"var(--palette-action-active)"}`
      }
    },
    ".run-stop-button": {
      backgroundColor: `${theme.vars.palette.grey[600]}cc`,
      color: "var(--palette-primary-main)",
      minWidth: "40px",
      height: "26px",
      borderRadius: "20px",
      position: "relative",
      overflow: "hidden",
      backgroundImage: `linear-gradient(135deg, ${"var(--palette-primary-main)"}20, ${
        theme.vars.palette.grey[600]
      }cc 40%, ${"var(--palette-secondary-main)"}20)`,
      "&:hover": {
        boxShadow: `0 0 4px ${"var(--palette-primary-main)"}55`,
        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
        transform: "translateY(-1px)"
      },
      "&.disabled": {
        opacity: 0.5
      },
      "&.running": {
        "& svg": {
          animation: "pulse-scale 1s ease-in-out infinite",
          color: theme.vars.palette.grey[400]
        }
      },
      "&::before": {
        content: '""',
        position: "absolute",
        top: 0,
        left: "-150%",
        width: "120%",
        height: "100%",
        background:
          "linear-gradient(120deg, transparent, rgba(255,255,255,0.25), transparent)",
        transform: "skewX(-20deg)",
        transition: "left 0.6s ease",
        pointerEvents: "none"
      }
    },
    ".run-stop-button.run-workflow": {
      backgroundImage: `linear-gradient(135deg, ${"var(--palette-primary-main)"}33, ${
        theme.vars.palette.grey[700]
      } 50%, ${"var(--palette-secondary-main)"}33)`,
      boxShadow: `0 0 0 0 ${"var(--palette-primary-main)"}40`,
      "&:hover": {
        boxShadow: `0 8px 24px ${"var(--palette-primary-main)"}40, 0 0 30px ${"var(--palette-secondary-main)"}30`,
        filter: "saturate(1.2)",
        "&::before": { left: "120%" }
      },
      "&.running": {
        backgroundColor: theme.vars.palette.grey[700],
        color: theme.vars.palette.grey[400],
        boxShadow: "none",
        "&::after": {
          content: '""',
          position: "absolute",
          inset: "0",
          borderRadius: "inherit",
          padding: "2px",
          background: `conic-gradient(from 0deg, transparent 50%, ${"var(--palette-primary-main)"} 95%, ${"var(--palette-primary-main)"})`,
          WebkitMask:
            "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "destination-out",
          maskComposite: "exclude",
          animation: "spin 2.5s linear infinite",
          pointerEvents: "none",
          zIndex: 1
        }
      }
    },
    ".run-stop-button.run-workflow.Mui-disabled.running": {
      opacity: 1
    },
    ".stop-workflow": {
      marginRight: "0.7em",
      "&.running": {
        backgroundColor: theme.vars.palette.warning.main,
        color: theme.vars.palette.warning.contrastText,
        boxShadow: `0 0 8px ${theme.vars.palette.warning.main}60`,
        "&:hover": {
          backgroundColor: theme.vars.palette.warning.dark,
          boxShadow: `0 0 12px ${theme.vars.palette.warning.main}80`
        }
      }
    },
    ".run-status": {
      position: "absolute",
      top: "25px",
      fontSize: theme.fontSizeSmaller,
      padding: "0.2em 0.8em",
      color: theme.vars.palette.grey[100],
      boxShadow: `0 2px 8px ${theme.vars.palette.grey[800]}40`
    },
    "@keyframes pulse-scale": {
      "0%": { transform: "scale(1)" },
      "50%": { transform: "scale(1.15)" },
      "100%": { transform: "scale(1)" }
    },
    "@keyframes pulse": {
      "0%": { opacity: 0.4 },
      "50%": { opacity: 1 },
      "100%": { opacity: 0.4 }
    },
    ".connecting-status": {
      animation: "pulse 1.5s infinite ease-in-out",
      color: "var(--palette-primary-main)"
    },
    "@keyframes spin": {
      "0%": { transform: "rotate(0deg)" },
      "25%": { transform: "rotate(85deg)" },
      "50%": { transform: "rotate(180deg)" },
      "75%": { transform: "rotate(280deg)" },
      "100%": { transform: "rotate(360deg)" }
    },
    "@keyframes dashboardPulse": {
      "0%, 100%": {
        boxShadow: `0 0 0 0 ${"var(--palette-primary-main)"}40`
      },
      "50%": {
        boxShadow: `0 0 0 8px ${"var(--palette-primary-main)"}00`
      }
    },
    ".dashboard-button::after": {
      content: '""',
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: "100%",
      height: "100%",
      borderRadius: "12px",
      animation: "dashboardPulse 2s infinite"
    }
  });

const NodeMenuButton = memo(function NodeMenuButton() {
  const openNodeMenu = useNodeMenuStore((state) => state.openNodeMenu);
  const closeNodeMenu = useNodeMenuStore((state) => state.closeNodeMenu);
  const isMenuOpen = useNodeMenuStore((state) => state.isMenuOpen);

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
    <Tooltip
      title={getShortcutTooltip("open NodeMenu")}
      enterDelay={TOOLTIP_ENTER_DELAY}
    >
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
  // Combine multiple useWorkflowManager subscriptions into a single selector with shallow equality
  // to reduce unnecessary re-renders when other parts of the workflow manager state change
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

  return (
    <Tooltip
      title={getShortcutTooltip("saveWorkflow")}
      enterDelay={TOOLTIP_ENTER_DELAY}
    >
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

const WorkflowModeSelect = memo(function WorkflowModeSelect() {
  // Use shallow equality to avoid re-renders when other node state changes
  const workflow = useNodes((state) => state.getWorkflow());

  const workflowMode = (workflow?.run_mode || "workflow") as string;

  // Combine selector with shallow equality (built into useWorkflowManager)
  const { saveWorkflow } = useWorkflowManager((state) => ({
    saveWorkflow: state.saveWorkflow
  }));

  const [selectIsOpen, setSelectIsOpen] = useState(false);

  const handleModeChange = useCallback(
    (event: React.ChangeEvent<{ value: unknown }>) => {
      const newMode = event.target.value as string;

      const updatedWorkflow = {
        ...workflow,
        run_mode: newMode
      };

      saveWorkflow(updatedWorkflow);
    },
    [saveWorkflow, workflow]
  );

  return (
    <Tooltip
      placement="top"
      title="Run Mode"
      enterDelay={TOOLTIP_ENTER_DELAY}
      slotProps={{
        popper: {
          sx: {
            visibility: selectIsOpen ? "hidden" : "visible"
          }
        }
      }}
    >
      <FormControl size="small" className="mode-select" tabIndex={-1}>
        <Select
          tabIndex={-1}
          inputProps={{ tabIndex: -1 }}
          value={workflowMode}
          onChange={handleModeChange as any}
          onOpen={() => setSelectIsOpen(true)}
          onClose={() => setSelectIsOpen(false)}
          displayEmpty
        >
          <MenuItem tabIndex={-1} value="workflow">
            Workflow
          </MenuItem>
          <MenuItem tabIndex={-1} value="chat">
            Chat
          </MenuItem>
          <MenuItem tabIndex={-1} value="comfy">
            Comfy
          </MenuItem>
          <MenuItem tabIndex={-1} value="tool">
            Tool
          </MenuItem>
        </Select>
      </FormControl>
    </Tooltip>
  );
});

const RunWorkflowButton = memo(function RunWorkflowButton() {
  // Subscribe to workflow only (stable reference), not nodes/edges arrays
  // This prevents re-renders when nodes/edges change
  const workflow = useNodes((state) => state.workflow);
  // Get the store reference to access current state without subscribing
  const nodeStore = useNodeStoreRef();
  // Get the run function from websocket runner
  const run = useWebsocketRunner((state) => state.run);

  const state = useWebsocketRunner((state) => state.state);
  const isWorkflowRunning = state === "running";

  const getWorkflow = useWorkflowManager((state) => state.getWorkflow);
  const saveWorkflow = useWorkflowManager((state) => state.saveWorkflow);

  const handleRun = useCallback(async () => {
    if (!isWorkflowRunning) {
      const currentState = nodeStore.getState();
      const currentWorkflow = currentState.getWorkflow();
      const shouldRunViaComfy =
        currentWorkflow.run_mode === "comfy" || currentState.isComfyWorkflow();

      if (shouldRunViaComfy) {
        await executeViaComfyUI(currentWorkflow.graph, undefined, currentWorkflow);
      } else {
        // Access current state directly when running, not in render
        run({}, workflow, currentState.nodes, currentState.edges);
      }
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
    nodeStore,
    getWorkflow,
    saveWorkflow
  ]);

  // Keyboard shortcuts for run (Ctrl+Enter / Cmd+Enter)
  useCombo(["control", "enter"], handleRun, true, !isWorkflowRunning);
  useCombo(["meta", "enter"], handleRun, true, !isWorkflowRunning);

  return (
    <Tooltip
      title={
        isWorkflowRunning
          ? "Workflow is currently running..."
          : getShortcutTooltip("runWorkflow")
      }
      enterDelay={TOOLTIP_ENTER_DELAY}
    >
      <span>
        <Button
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
                {state === "connecting" ? "Connecting" : ""}
              </span>
              <PlayArrow />
            </>
          ) : isWorkflowRunning ? (
            <CircularProgress size={20} color="inherit" />
          ) : (
            <PlayArrow />
          )}
        </Button>
      </span>
    </Tooltip>
  );
});

const StopWorkflowButton = memo(function StopWorkflowButton() {
  const { isWorkflowRunning, cancel } = useWebsocketRunner((state) => ({
    isWorkflowRunning: state.state === "running",
    cancel: state.cancel
  }));

  const handleCancel = useCallback(() => {
    cancel();
  }, [cancel]);

  // Keyboard shortcut for stop (Escape)
  useCombo(["escape"], handleCancel, true, isWorkflowRunning);

  return (
    <Tooltip
      title={getShortcutTooltip("stopWorkflow")}
      enterDelay={TOOLTIP_ENTER_DELAY}
    >
      <Button
        className={`action-button run-stop-button stop-workflow ${
          !isWorkflowRunning ? "disabled" : "running"
        }`}
        onClick={handleCancel}
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
      const api = (window as any)["api"] as
        | { runApp: (workflowId: string) => void }
        | undefined;
      if (api) {
        api.runApp(workflowId);
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
      <Button
        className="action-button run-as-app-button"
        sx={{
          borderRadius: 0,
          position: "fixed",
          top: "40px",
          right: "0px",
          width: "48px",
          height: "37px"
        }}
        onClick={handleRunAsApp}
        tabIndex={-1}
      >
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
  // Use shallow equality to avoid re-renders when other node state changes
  const getWorkflow = useNodes((state) => state.getWorkflow);

  const handleEditWorkflow = useCallback(() => {
    setWorkflowToEdit(getWorkflow());
  }, [getWorkflow, setWorkflowToEdit]);

  return (
    <>
      <Tooltip title="Edit Workflow Settings" enterDelay={TOOLTIP_ENTER_DELAY}>
        <Button
          className="action-button"
          onClick={handleEditWorkflow}
          tabIndex={-1}
        >
          <EditIcon />
        </Button>
      </Tooltip>
    </>
  );
});

const DownloadWorkflowButton = memo(function DownloadWorkflowButton() {
  // Use shallow equality to avoid re-renders when other node state changes
  const { workflow, workflowJSON } = useNodes(
    (state) => ({
      workflow: state.workflow,
      workflowJSON: state.workflowJSON
    }),
    shallow
  );

  const handleDownload = useCallback(() => {
    const blob = new Blob([workflowJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `${workflow.name}.json`;
    link.href = url;
    link.click();
  }, [workflowJSON, workflow]);

  return (
    <Tooltip title="Download Workflow JSON" enterDelay={TOOLTIP_ENTER_DELAY}>
      <Button className="action-button" onClick={handleDownload} tabIndex={-1}>
        <DownloadIcon />
      </Button>
    </Tooltip>
  );
});

interface AppToolbarProps {
  setWorkflowToEdit: (workflow: Workflow) => void;
}

const AppToolbar: React.FC<AppToolbarProps> = ({ setWorkflowToEdit }) => {
  const theme = useTheme();
  const path = useLocation().pathname;
  // Use shallow equality to avoid re-renders when other node state changes
  const { autoLayout, workflow } = useNodes(
    (state) => ({
      autoLayout: state.autoLayout,
      workflow: state.workflow
    }),
    shallow
  );

  return (
    <Box sx={{ flexGrow: 1 }}>
      {path.startsWith("/editor") && (
        <div className="actions" css={styles(theme)}>
          <>
            <NodeMenuButton />
            <EditWorkflowButton setWorkflowToEdit={setWorkflowToEdit} />
            <SaveWorkflowButton />
            <DownloadWorkflowButton />
            <AutoLayoutButton autoLayout={autoLayout} />
            <WorkflowModeSelect />
            <RunWorkflowButton />
            <StopWorkflowButton />
            {isLocalhost && workflow?.run_mode === "app" && <RunAsAppButton />}
          </>
        </div>
      )}
    </Box>
  );
};

export default memo(AppToolbar, isEqual);
