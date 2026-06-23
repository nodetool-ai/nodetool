import { useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useWebsocketRunner } from "../stores/WorkflowRunner";
import { useRunningJobs } from "./useRunningJobs";
import { useNodes, useNodeStoreRef } from "../contexts/NodeContext";
import { useWorkflowManager } from "../contexts/WorkflowManagerContext";
import { useSettingsStore } from "../stores/SettingsStore";
import { triggerAutosaveForWorkflow } from "./useAutosave";
import useMetadataStore from "../stores/MetadataStore";
import { useRunWarningStore } from "../stores/RunWarningStore";
import { useModelCalloutStore } from "../stores/ModelCalloutStore";
import { usePropertyHighlightStore } from "../stores/PropertyHighlightStore";
import { findMissingModelNodes } from "../utils/findMissingModelNodes";
import { countHeavyNodes } from "../utils/heavyNodes";
import useNodeMenuStore from "../stores/NodeMenuStore";
import { useBottomPanelStore } from "../stores/BottomPanelStore";
import { usePanelStore } from "../stores/PanelStore";
import { useMiniMapStore } from "../stores/MiniMapStore";

/**
 * Hook that provides all action handlers for the floating toolbar.
 * Includes workflow execution, save, download, layout, and panel management.
 *
 * @returns Object containing all toolbar action handlers
 */
export interface FloatingToolbarActions {
  handleRun: () => Promise<void>;
  handleStop: () => void;
  handlePause: () => void;
  handleResume: () => void;
  handleSave: () => void;
  handleDownload: () => void;
  handleAutoLayout: () => void;
  handleRunAsApp: () => void;
  handleEditWorkflow: () => void;
  handleToggleNodeMenu: () => void;
  handleToggleTrace: () => void;
  handleToggleMiniMap: () => void;
  isWorkflowRunning: boolean;
  isPaused: boolean;
  isSuspended: boolean;
  /** 1-based queue position while waiting for a run slot, else null. */
  queuePosition: number | null;
  /** Number of runs the user has queued behind the active run. */
  pendingRunCount: number;
}

export const useFloatingToolbarActions = (): FloatingToolbarActions => {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;

  const nodeStore = useNodeStoreRef();
  const workflow = useNodes((state) => state.workflow);
  const autoLayout = useNodes((state) => state.autoLayout);
  const workflowJSON = useNodes((state) => state.workflowJSON);

  const run = useWebsocketRunner((state) => state.run);
  const state = useWebsocketRunner((state) => state.state);
  const isWorkflowRunning = state === "running";
  const isPaused = state === "paused";
  const isSuspended = state === "suspended";
  const queuePosition = useWebsocketRunner((state) => state.queuePosition);
  const { data: jobs } = useRunningJobs();
  const pendingRunCount = useMemo(
    () =>
      (jobs ?? []).filter(
        (job) =>
          job.workflow_id === workflow?.id &&
          (job.status === "queued" ||
            job.status === "scheduled" ||
            job.status === "starting")
      ).length,
    [jobs, workflow?.id]
  );
  const cancel = useWebsocketRunner((state) => state.cancel);
  const pause = useWebsocketRunner((state) => state.pause);
  const resume = useWebsocketRunner((state) => state.resume);

  const getWorkflowById = useWorkflowManager((state) => state.getWorkflow);
  const saveWorkflow = useWorkflowManager((state) => state.saveWorkflow);

  const autosave = useSettingsStore((state) => state.settings.autosave);
  const confirmLargeRun = useSettingsStore(
    (state) => state.settings.confirmLargeRun
  );
  const largeRunThreshold = useSettingsStore(
    (state) => state.settings.largeRunThreshold
  );
  const requestRunConfirmation = useRunWarningStore(
    (state) => state.requestConfirmation
  );
  const showModelCallout = useModelCalloutStore((state) => state.show);

  const openNodeMenu = useNodeMenuStore((state) => state.openNodeMenu);
  const closeNodeMenu = useNodeMenuStore((state) => state.closeNodeMenu);
  const isMenuOpen = useNodeMenuStore((state) => state.isMenuOpen);

  const handlePanelViewChange = usePanelStore(
    (state) => state.handleViewChange
  );

  const toggleBottomPanel = useBottomPanelStore(
    (state) => state.handleViewChange
  );

  const toggleMiniMap = useMiniMapStore((state) => state.toggleVisible);

  const handleRun = useCallback(async () => {
    const doRun = async () => {
      // Autosave on run start, but only when there are unsaved changes. The
      // autosave endpoint dedupes by content, so this never adds a redundant
      // version. (force only bypasses the time rate-limit, not the dedup.)
      if (autosave?.saveBeforeRun && nodeStore.getState().workflowIsDirty) {
        const w = getWorkflowById(workflow.id);
        if (w?.graph?.nodes && w.graph.nodes.length > 0) {
          await triggerAutosaveForWorkflow(workflow.id, w.graph, "checkpoint", {
            description: "Before execution",
            force: true,
            maxVersions: autosave.maxVersionsPerWorkflow
          });
        }
      }

      // Access current state directly to avoid re-renders on every node drag
      const { nodes, edges } = nodeStore.getState();
      run({}, workflow, nodes, edges, undefined, undefined, true);
    };

    // Catch nodes with no model set before the run fails on the server. Select
    // and reveal the first offending node, flag every unset model field so the
    // inspector shows an inline call-out next to each, and pulse the first one.
    // Only blocks a fresh run — concurrent/resume paths below already have a
    // job going.
    if (!isWorkflowRunning && !isPaused && !isSuspended) {
      const { nodes, edges } = nodeStore.getState();
      const missing = findMissingModelNodes(
        nodes,
        edges,
        useMetadataStore.getState().getMetadata
      );
      if (missing.length > 0) {
        const first = missing[0];
        showModelCallout(missing);
        const target = nodeStore
          .getState()
          .nodes.find((n) => n.id === first.nodeId);
        if (target) {
          nodeStore.getState().setSelectedNodes([target]);
          nodeStore.getState().setShouldFitToScreen(true, [first.nodeId]);
          usePropertyHighlightStore
            .getState()
            .highlight(first.nodeId, first.propertyName);
        }
        return;
      }
    }

    // Clicking Run while a run is in progress starts a second run alongside
    // it (for in-browser runs the server queue can't see the active run, so
    // "queued" starts immediately). That's rarely what a double-click meant —
    // always confirm first. Never suppressed.
    if (isWorkflowRunning || isPaused || isSuspended) {
      requestRunConfirmation({
        kind: "concurrent",
        onConfirm: () => {
          void doRun();
        }
      });
      return;
    }

    // "Run Workflow" fires every executable node at once, so warn first when
    // a run would launch many provider/model nodes, unless the user disabled
    // the warning or dismissed it for this session.
    const { nodes } = nodeStore.getState();
    const heavyCount = countHeavyNodes(
      nodes,
      useMetadataStore.getState().getMetadata
    );
    const suppressed = useRunWarningStore.getState().suppressedThisSession;
    if (confirmLargeRun && !suppressed && heavyCount > largeRunThreshold) {
      requestRunConfirmation({
        heavyCount,
        threshold: largeRunThreshold,
        onConfirm: () => {
          void doRun();
        }
      });
    } else {
      await doRun();
    }
  }, [
    run,
    workflow,
    nodeStore,
    getWorkflowById,
    autosave,
    confirmLargeRun,
    largeRunThreshold,
    requestRunConfirmation,
    showModelCallout,
    isWorkflowRunning,
    isPaused,
    isSuspended
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
    handlePanelViewChange("settings");
  }, [handlePanelViewChange]);

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

  const handleToggleTrace = useCallback(() => {
    toggleBottomPanel("trace");
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
    handleToggleTrace,
    handleToggleMiniMap,
    isWorkflowRunning,
    isPaused,
    isSuspended,
    queuePosition,
    pendingRunCount
  };
};
