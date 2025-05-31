import { memo, useCallback, useEffect, useState } from "react";
import { Tooltip, IconButton, Button, CircularProgress, FormControl, Select, MenuItem } from "@mui/material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import ChatIcon from "@mui/icons-material/Chat";
import ControlPointIcon from "@mui/icons-material/ControlPoint";
import SaveIcon from "@mui/icons-material/Save";
import LayoutIcon from "@mui/icons-material/ViewModule";
import PlayArrow from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import EditIcon from "@mui/icons-material/Edit";
import DownloadIcon from "@mui/icons-material/Download";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";
import { useLocation, useNavigate } from "react-router-dom";
import useNodeMenuStore from "../../../stores/NodeMenuStore";
import { useNodes } from "../../../contexts/NodeContext";
import { useWorkflowManager } from "../../../contexts/WorkflowManagerContext";
import { useNotificationStore } from "../../../stores/NotificationStore";
import useWorkflowRunner from "../../../stores/WorkflowRunner";
import { useCombo } from "../../../stores/KeyPressedStore";
import { Workflow } from "../../../stores/ApiTypes";
import { isLocalhost } from "../../../stores/ApiClient";

export const useGlobalHotkeys = (callback: () => void) => {
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

export const DashboardButton = memo(function DashboardButton() {
  const navigate = useNavigate();
  const handleClick = useCallback(() => {
    navigate("/dashboard");
  }, [navigate]);

  return (
    <Tooltip title="Go to Dashboard" enterDelay={TOOLTIP_ENTER_DELAY} placement="right">
      <IconButton className="dashboard-button" onClick={handleClick} tabIndex={-1}>
        <DashboardIcon />
      </IconButton>
    </Tooltip>
  );
});

export const ChatButton = memo(function ChatButton() {
  const navigate = useNavigate();
  const handleClick = useCallback(() => {
    navigate("/chat");
  }, [navigate]);

  return (
    <Tooltip title="Go to Chat" enterDelay={TOOLTIP_ENTER_DELAY} placement="right">
      <IconButton className="chat-button" onClick={handleClick} tabIndex={-1}>
        <ChatIcon />
      </IconButton>
    </Tooltip>
  );
});

export const NodeMenuButton = memo(function NodeMenuButton() {
  const { openNodeMenu, closeNodeMenu, isMenuOpen } = useNodeMenuStore((state) => ({
    openNodeMenu: state.openNodeMenu,
    closeNodeMenu: state.closeNodeMenu,
    isMenuOpen: state.isMenuOpen
  }));

  const handleToggleNodeMenu = useCallback(() => {
    if (isMenuOpen) {
      closeNodeMenu();
    } else {
      openNodeMenu({ x: 400, y: 200 });
    }
  }, [isMenuOpen, openNodeMenu, closeNodeMenu]);

  return (
    <Tooltip title="Toggle Node Menu" enterDelay={TOOLTIP_ENTER_DELAY}>
      <Button className={`action-button node-menu-button ${isMenuOpen ? "active" : ""}`} onClick={handleToggleNodeMenu} tabIndex={-1}>
        <ControlPointIcon />
      </Button>
    </Tooltip>
  );
});

export const SaveWorkflowButton = memo(function SaveWorkflowButton() {
  const { saveWorkflow, getCurrentWorkflow } = useWorkflowManager((state) => ({
    saveWorkflow: state.saveWorkflow,
    getCurrentWorkflow: state.getCurrentWorkflow
  }));
  const addNotification = useNotificationStore((state) => state.addNotification);

  const handleSave = useCallback(async () => {
    const workflow = getCurrentWorkflow();
    if (workflow) {
      await saveWorkflow(workflow);
      addNotification({ content: `Workflow ${workflow.name} saved`, type: "success", alert: true });
    }
  }, [saveWorkflow, getCurrentWorkflow, addNotification]);

  return (
    <Tooltip title="Save workflow" enterDelay={TOOLTIP_ENTER_DELAY}>
      <Button className="action-button" onClick={handleSave} tabIndex={-1}>
        <SaveIcon />
      </Button>
    </Tooltip>
  );
});

export const AutoLayoutButton = memo(function AutoLayoutButton({ autoLayout }: { autoLayout: () => void }) {
  return (
    <Tooltip title="Arranges all nodes or selected nodes" enterDelay={TOOLTIP_ENTER_DELAY}>
      <Button className="action-button" onClick={autoLayout} tabIndex={-1}>
        <LayoutIcon />
      </Button>
    </Tooltip>
  );
});

export const WorkflowModeSelect = memo(function WorkflowModeSelect() {
  const { getWorkflow } = useNodes((state) => ({ getWorkflow: state.getWorkflow }));
  const workflow = getWorkflow();
  const workflowMode = (workflow?.settings?.run_mode || "normal") as string;
  const { saveWorkflow } = useWorkflowManager((state) => ({ saveWorkflow: state.saveWorkflow }));
  const [runMode, setRunMode] = useState<string>(workflowMode);
  const [selectIsOpen, setSelectIsOpen] = useState(false);

  useEffect(() => {
    if (workflowMode) {
      setRunMode(workflowMode);
    } else {
      setRunMode("normal");
    }
  }, [workflowMode]);

  const handleModeChange = (event: React.ChangeEvent<{ value: unknown }>) => {
    const newMode = event.target.value as string;
    setRunMode(newMode);

    const updatedWorkflow = {
      ...workflow,
      settings: { ...(workflow.settings || {}), run_mode: newMode }
    };

    saveWorkflow(updatedWorkflow);
  };

  return (
    <Tooltip placement="top" title="Run Mode" enterDelay={TOOLTIP_ENTER_DELAY} PopperProps={{ sx: { visibility: selectIsOpen ? "hidden" : "visible" } }}>
      <FormControl size="small" className="mode-select" tabIndex={-1}>
        <Select
          tabIndex={-1}
          inputProps={{ tabIndex: -1 }}
          value={runMode}
          onChange={handleModeChange as any}
          onOpen={() => setSelectIsOpen(true)}
          onClose={() => setSelectIsOpen(false)}
          displayEmpty
        >
          <MenuItem tabIndex={-1} value="normal">
            Normal
          </MenuItem>
          <MenuItem tabIndex={-1} value="app">
            App
          </MenuItem>
          <MenuItem tabIndex={-1} value="chat">
            Chat
          </MenuItem>
          <MenuItem tabIndex={-1} value="headless">
            Headless
          </MenuItem>
        </Select>
      </FormControl>
    </Tooltip>
  );
});

export const RunWorkflowButton = memo(function RunWorkflowButton() {
  const { workflow, nodes, edges } = useNodes((state) => ({ workflow: state.workflow, nodes: state.nodes, edges: state.edges }));
  const { run, state, isWorkflowRunning } = useWorkflowRunner((state) => ({ run: state.run, state: state.state, isWorkflowRunning: state.state === "running" }));
  const { getWorkflow, saveWorkflow } = useWorkflowManager((state) => ({ getWorkflow: state.getWorkflow, saveWorkflow: state.saveWorkflow }));

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
  }, [isWorkflowRunning, run, workflow, nodes, edges, getWorkflow, saveWorkflow]);

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
      <span>
        <Button size="large" className={`action-button run-stop-button run-workflow ${isWorkflowRunning ? "running" : ""}`} onClick={handleRun} disabled={isWorkflowRunning} tabIndex={-1}>
          {state === "connecting" || state === "connected" ? (
            <>
              <span className={`run-status ${state === "connecting" ? "connecting-status" : ""}`}>{state === "connecting" ? "Connecting" : "Connected"}</span>
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

export const StopWorkflowButton = memo(function StopWorkflowButton() {
  const { isWorkflowRunning, cancel } = useWorkflowRunner((state) => ({ isWorkflowRunning: state.state === "running", cancel: state.cancel }));
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
      <Button size="large" className={`action-button run-stop-button stop-workflow ${!isWorkflowRunning ? "disabled" : ""}`} onClick={() => cancel()} tabIndex={-1}>
        <StopIcon />
      </Button>
    </Tooltip>
  );
});

export const RunAsAppButton = memo(function RunAsAppButton() {
  const location = useLocation();
  const workflowId = location.pathname.split("/").pop();

  const handleRunAsApp = useCallback(() => {
    if (workflowId) {
      if (window.api) {
        window.api.runApp(workflowId);
      } else {
        window.open("http://localhost:5173/index.html?workflow_id=" + workflowId, "_blank");
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

export const EditWorkflowButton = memo(function EditWorkflowButton({ setWorkflowToEdit }: { setWorkflowToEdit: (workflow: Workflow) => void }) {
  const { getWorkflow } = useNodes((state) => ({ getWorkflow: state.getWorkflow }));
  return (
    <Tooltip title="Edit Workflow Settings" enterDelay={TOOLTIP_ENTER_DELAY}>
      <Button className="action-button" onClick={() => setWorkflowToEdit(getWorkflow())} tabIndex={-1}>
        <EditIcon />
      </Button>
    </Tooltip>
  );
});

export const DownloadWorkflowButton = memo(function DownloadWorkflowButton() {
  const { workflow, workflowJSON } = useNodes((state) => ({ workflow: state.workflow, workflowJSON: state.workflowJSON }));
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

export const ShouldShowRunAsAppButton = () => isLocalhost;
