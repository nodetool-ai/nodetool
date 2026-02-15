import { useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useWebsocketRunner } from "../stores/WorkflowRunner";
import { useNodes, useNodeStoreRef } from "../contexts/NodeContext";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import { useSettingsStore } from "../stores/SettingsStore";
import { triggerAutosaveForWorkflow } from "./useAutosave";
import { executeViaComfyUI } from "../utils/comfyExecutor";
import useNodeMenuStore from "../stores/NodeMenuStore";
import { useRightPanelStore } from "../stores/RightPanelStore";
import { useBottomPanelStore } from "../stores/BottomPanelStore";
import { useMiniMapStore } from "../stores/MiniMapStore";

/**
 * Hook that provides all action handlers for the floating toolbar.
 * Includes workflow execution, save, download, layout, and panel management.
 *
 * @returns Object containing all toolbar action handlers
 */
export const useFloatingToolbarActions = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;

  const nodeStore = useNodeStoreRef();
  const { workflow, autoLayout, workflowJSON } = useNodes((state) => ({
    workflow: state.workflow,
    autoLayout: state.autoLayout,
    workflowJSON: state.workflowJSON
  }));

  const {
    run,
    isWorkflowRunning,
    isPaused,
    isSuspended,
    cancel,
    pause,
    resume
  } = useWebsocketRunner((state) => ({
    run: state.run,
    isWorkflowRunning: state.state === "running",
    isPaused: state.state === "paused",
    isSuspended: state.state === "suspended",
    cancel: state.cancel,
    pause: state.pause,
    resume: state.resume
  }));

  const { getWorkflow: getWorkflowById, saveWorkflow } = useWorkflowManager(
    (state) => ({
      getWorkflow: state.getWorkflow,
      saveWorkflow: state.saveWorkflow
    })
  );

  const { autosave } = useSettingsStore((state) => ({
    autosave: state.settings.autosave
  }));

  const { openNodeMenu, closeNodeMenu, isMenuOpen } = useNodeMenuStore(
    (state) => ({
      openNodeMenu: state.openNodeMenu,
      closeNodeMenu: state.closeNodeMenu,
      isMenuOpen: state.isMenuOpen
    })
  );

  const toggleWorkflowPanel = useRightPanelStore(
    (state) => () => state.handleViewChange("workflow")
  );

  const toggleBottomPanel = useBottomPanelStore(
    (state) => state.handleViewChange
  );

  const { toggleVisible: toggleMiniMap } = useMiniMapStore((state) => ({
    toggleVisible: state.toggleVisible
  }));

  const handleRun = useCallback(async () => {
    if (!isWorkflowRunning) {
      // Create a checkpoint version before execution if enabled
      if (autosave?.saveBeforeRun) {
        const w = getWorkflowById(workflow.id);
        if (w?.graph?.nodes && w.graph.nodes.length > 0) {
          await triggerAutosaveForWorkflow(workflow.id, w.graph, "checkpoint", {
            description: "Before execution",
            force: true,
            maxVersions: autosave.maxVersionsPerWorkflow
          });
        }
      }

      const currentState = nodeStore.getState();
      const currentWorkflow = currentState.getWorkflow();
      const shouldRunViaComfy =
        currentWorkflow.run_mode === "comfy" || currentState.isComfyWorkflow();

      // Access current state directly to avoid re-renders on every node drag
      const { nodes, edges } = currentState;
      if (shouldRunViaComfy) {
        await executeViaComfyUI(
          currentWorkflow.graph,
          undefined,
          currentWorkflow
        );
      } else {
        run({}, workflow, nodes, edges, undefined);
      }
    }
    setTimeout(() => {
      const w = getWorkflowById(workflow.id);
      if (w) {
        saveWorkflow(w);
      }
    }, 100);
  }, [
    isWorkflowRunning,
    run,
    workflow,
    nodeStore,
    getWorkflowById,
    saveWorkflow,
    autosave
  ]);

  const handleStop = useCallback(() => {
    cancel();
  }, [cancel]);

  const handlePause = useCallback(() => {
    pause();
  }, [pause]);

  const handleResume = useCallback(() => {
    resume();
  }, [resume]);

  const handleSave = useCallback(() => {
    if (!workflow) {
      return;
    }
    const w = getWorkflowById(workflow.id);
    if (w) {
      saveWorkflow(w);
    }
  }, [getWorkflowById, saveWorkflow, workflow]);

  const handleDownload = useCallback(() => {
    if (!workflow) {
      return;
    }
    const blob = new Blob([workflowJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `${workflow.name}.json`;
    link.href = url;
    link.click();
  }, [workflow, workflowJSON]);

  const handleAutoLayout = useCallback(() => {
    autoLayout();
  }, [autoLayout]);

  const handleRunAsApp = useCallback(() => {
    const workflowId = path.split("/").pop();
    if (workflowId) {
      navigate(`/apps/${workflowId}`);
    }
  }, [navigate, path]);

  const handleEditWorkflow = useCallback(() => {
    toggleWorkflowPanel();
  }, [toggleWorkflowPanel]);

  const handleToggleNodeMenu = useCallback(() => {
    if (isMenuOpen) {
      closeNodeMenu();
    } else {
      const FALLBACK_MENU_WIDTH = 950;
      const FALLBACK_MENU_HEIGHT = 900;
      const CURSOR_ANCHOR_OFFSET_Y = 40;
      const x = Math.floor(window.innerWidth / 2 - FALLBACK_MENU_WIDTH / 2);
      const y = Math.floor(
        window.innerHeight / 2 -
          FALLBACK_MENU_HEIGHT / 2 +
          CURSOR_ANCHOR_OFFSET_Y
      );
      openNodeMenu({ x, y });
    }
  }, [isMenuOpen, openNodeMenu, closeNodeMenu]);

  const handleToggleTerminal = useCallback(() => {
    toggleBottomPanel("terminal");
  }, [toggleBottomPanel]);

  const handleToggleMiniMap = useCallback(() => {
    toggleMiniMap();
  }, [toggleMiniMap]);

  return {
    handleRun,
    handleStop,
    handlePause,
    handleResume,
    handleSave,
    handleDownload,
    handleAutoLayout,
    handleRunAsApp,
    handleEditWorkflow,
    handleToggleNodeMenu,
    handleToggleTerminal,
    handleToggleMiniMap,
    isWorkflowRunning,
    isPaused,
    isSuspended
  };
};
