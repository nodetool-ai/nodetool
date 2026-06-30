import { memo, useCallback, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { useNavigate } from "react-router-dom";

import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import useMetadataStore from "../../stores/MetadataStore";
import { setFrontendToolRuntimeState } from "../../lib/tools/frontendToolRuntimeState";
import { getWorkflowRunnerStore } from "../../stores/WorkflowRunner";

/**
 * Keeps the frontend tool runtime state (the context `ui_*` tools execute
 * against) in sync with the workflow manager. Mount it anywhere an agent with
 * workflow tools is active — the editor's right panel and the app builder both
 * render it so the agent can read and edit the open workflow.
 */
const FrontendToolRuntimeSync = memo(function FrontendToolRuntimeSync() {
  const navigate = useNavigate();
  const {
    openWorkflows,
    currentWorkflowId,
    getWorkflow,
    addWorkflow,
    removeWorkflow,
    getNodeStore,
    updateWorkflow,
    saveWorkflow,
    getCurrentWorkflow,
    setCurrentWorkflowId,
    fetchWorkflow,
    newWorkflow,
    createNew,
    searchTemplates,
    copy
  } = useWorkflowManager(
    useShallow((state) => ({
      openWorkflows: state.openWorkflows,
      currentWorkflowId: state.currentWorkflowId,
      getWorkflow: state.getWorkflow,
      addWorkflow: state.addWorkflow,
      removeWorkflow: state.removeWorkflow,
      getNodeStore: state.getNodeStore,
      updateWorkflow: state.updateWorkflow,
      saveWorkflow: state.saveWorkflow,
      getCurrentWorkflow: state.getCurrentWorkflow,
      setCurrentWorkflowId: state.setCurrentWorkflowId,
      fetchWorkflow: state.fetchWorkflow,
      newWorkflow: state.newWorkflow,
      createNew: state.createNew,
      searchTemplates: state.searchTemplates,
      copy: state.copy
    }))
  );
  const nodeMetadata = useMetadataStore((state) => state.metadata);

  const openWorkflow = useCallback(
    async (workflowId: string) => {
      const workflow = await fetchWorkflow(workflowId);
      if (!workflow) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }
      setCurrentWorkflowId(workflowId);
      navigate(`/editor/${workflowId}`);
    },
    [fetchWorkflow, navigate, setCurrentWorkflowId]
  );

  const runWorkflowById = useCallback(
    async (workflowId: string, params: Record<string, unknown> = {}) => {
      const workflow =
        (await fetchWorkflow(workflowId)) ?? getWorkflow(workflowId);
      if (!workflow) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      const nodeStore = getNodeStore(workflowId)?.getState();
      if (!nodeStore) {
        throw new Error(`No node store for workflow ${workflowId}`);
      }

      const { nodes, edges } = nodeStore;
      await getWorkflowRunnerStore(workflowId)
        .getState()
        .run(params, workflow, nodes, edges, undefined, undefined, true);
    },
    [fetchWorkflow, getNodeStore, getWorkflow]
  );

  const switchTab = useCallback(
    async (tabIndex: number) => {
      const workflow = openWorkflows[tabIndex];
      if (!workflow) {
        throw new Error(
          `Tab index ${tabIndex} is out of range (open tabs: ${openWorkflows.length})`
        );
      }

      await openWorkflow(workflow.id);
      return workflow.id;
    },
    [openWorkflow, openWorkflows]
  );

  const copyToClipboard = useCallback(async (text: string) => {
    if (window.api?.clipboard?.writeText) {
      await window.api.clipboard.writeText(text);
      return;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    throw new Error("Clipboard write is not available");
  }, []);

  const pasteFromClipboard = useCallback(async () => {
    if (window.api?.clipboard?.readText) {
      return window.api.clipboard.readText();
    }
    if (navigator.clipboard?.readText) {
      return navigator.clipboard.readText();
    }
    throw new Error("Clipboard read is not available");
  }, []);

  useEffect(() => {
    setFrontendToolRuntimeState({
      nodeMetadata,
      getOpenWorkflowIds: () => openWorkflows.map((workflow) => workflow.id),
      openWorkflow,
      runWorkflow: runWorkflowById,
      switchTab,
      copyToClipboard,
      pasteFromClipboard,
      currentWorkflowId,
      getWorkflow,
      addWorkflow,
      removeWorkflow,
      getNodeStore,
      updateWorkflow,
      saveWorkflow,
      getCurrentWorkflow,
      setCurrentWorkflowId,
      fetchWorkflow: async (id: string) => {
        await fetchWorkflow(id);
      },
      newWorkflow,
      createNew,
      searchTemplates,
      copy
    });
  }, [
    nodeMetadata,
    openWorkflows,
    openWorkflow,
    runWorkflowById,
    switchTab,
    copyToClipboard,
    pasteFromClipboard,
    currentWorkflowId,
    getWorkflow,
    addWorkflow,
    removeWorkflow,
    getNodeStore,
    updateWorkflow,
    saveWorkflow,
    getCurrentWorkflow,
    setCurrentWorkflowId,
    fetchWorkflow,
    newWorkflow,
    createNew,
    searchTemplates,
    copy
  ]);

  return null;
});

export default FrontendToolRuntimeSync;
