/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, useMediaQuery } from "@mui/material";
import Inspector from "../Inspector";
import { useResizeRightPanel } from "../../hooks/handlers/useResizeRightPanel";
import { useRightPanelStore } from "../../stores/RightPanelStore";
import { memo, useCallback, useEffect } from "react";
import isEqual from "fast-deep-equal";
import { NodeContext } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useShallow } from "zustand/react/shallow";
import { useNavigate } from "react-router-dom";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import { ReactFlowProvider } from "@xyflow/react";
import { useStoreWithEqualityFn } from "zustand/traditional";
import useMetadataStore from "../../stores/MetadataStore";
import { setFrontendToolRuntimeState } from "../../lib/tools/frontendToolRuntimeState";
import { getWorkflowRunnerStore } from "../../stores/WorkflowRunner";
import type { NodeStore } from "../../stores/NodeStore";
import { useSubgraphTabsStore } from "../../stores/SubgraphTabsStore";

import { PANEL_RESIZE_HANDLE_WIDTH } from "../../config/constants";
import ContextMenus from "../context_menus/ContextMenus";
import { MobileBottomSheet } from "../ui_primitives";

const HEADER_AREA_HEIGHT = 77;

const styles = (theme: Theme) =>
  css({
    position: "fixed",
    right: 0,
    top: `${HEADER_AREA_HEIGHT}px`,
    height: `calc(100vh - ${HEADER_AREA_HEIGHT}px)`,
    display: "flex",
    flexDirection: "row",
    zIndex: 1100,

    ".drawer-content": {
      height: "100%",
      backgroundColor: theme.vars.palette.background.default,
      borderLeft: `1px solid ${theme.vars.palette.divider}`,
      boxShadow: "-4px 0 8px rgba(0, 0, 0, 0.05)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    },

    ".panel-button": {
      width: `${PANEL_RESIZE_HANDLE_WIDTH}px`,
      position: "absolute",
      left: 0,
      top: 0,
      height: "100%",
      backgroundColor: "transparent",
      border: 0,
      borderRadius: 0,
      cursor: "ew-resize",
      zIndex: 10,
      transition: "all 0.2s ease",

      "&:hover": {
        backgroundColor: theme.vars.palette.primary.main,
        boxShadow: `0 0 8px ${theme.vars.palette.primary.main}40`,
        transform: "scaleX(1.5)"
      },
      "&:active": {
        backgroundColor: theme.vars.palette.primary.main,
        boxShadow: `0 0 12px ${theme.vars.palette.primary.main}60`,
        transform: "scaleX(2)"
      }
    },

    ".panel-inner-content": {
      display: "flex",
      flex: 1,
      height: "100%",
      overflow: "hidden"
    }
  });

/**
 * Side-effect block: keep frontend tool runtime state in sync with workflow
 * manager. Lives here because the editor mounts PanelRight on every workflow
 * route. Renders nothing.
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
        .run(params, workflow, nodes, edges);
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

/**
 * Selection-driven visibility for the inspector. Subscribes to the active
 * workflow's node store and mirrors `selection > 0` onto the right panel's
 * visibility — selecting a node opens the panel, deselecting closes it.
 * Renders nothing.
 */
const InspectorVisibilitySync = memo(function InspectorVisibilitySync({
  activeNodeStore
}: {
  activeNodeStore: NodeStore;
}) {
  const hasSelection = useStoreWithEqualityFn(
    activeNodeStore,
    (state) => state.nodes.some((node) => node.selected)
  );
  const setVisibility = useRightPanelStore((state) => state.setVisibility);
  useEffect(() => {
    setVisibility(hasSelection);
  }, [hasSelection, setVisibility]);
  return null;
});

const PanelRight: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const {
    ref: panelRef,
    size: panelSize,
    isVisible,
    isDragging,
    handleMouseDown
  } = useResizeRightPanel("right");

  const setVisibility = useRightPanelStore((state) => state.setVisibility);

  const activeSubgraphTab = useSubgraphTabsStore((state) =>
    state.activeKey
      ? state.tabs.find((t) => t.key === state.activeKey)
      : undefined
  );
  const workflowNodeStore = useWorkflowManager((state) =>
    state.currentWorkflowId
      ? state.nodeStores[state.currentWorkflowId]
      : undefined
  );
  const activeNodeStore = activeSubgraphTab?.store ?? workflowNodeStore;

  const handleMobileSheetClose = useCallback(
    () => setVisibility(false),
    [setVisibility]
  );

  const inspectorBody = activeNodeStore ? (
    <ContextMenuProvider>
      <ReactFlowProvider>
        <NodeContext.Provider value={activeNodeStore}>
          <ContextMenus />
          <Inspector />
        </NodeContext.Provider>
      </ReactFlowProvider>
    </ContextMenuProvider>
  ) : null;

  if (isMobile) {
    return (
      <>
        <FrontendToolRuntimeSync />
        {activeNodeStore && (
          <InspectorVisibilitySync activeNodeStore={activeNodeStore} />
        )}
        <MobileBottomSheet
          open={isVisible}
          onClose={handleMobileSheetClose}
          title="Inspector"
          ariaLabel="Inspector panel"
        >
          <Box
            sx={{
              height: "65vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden"
            }}
          >
            {inspectorBody}
          </Box>
        </MobileBottomSheet>
      </>
    );
  }

  return (
    <>
      <FrontendToolRuntimeSync />
      {activeNodeStore && (
        <InspectorVisibilitySync activeNodeStore={activeNodeStore} />
      )}
      {isVisible && (
        <div css={styles(theme)} className="panel-right-container">
          <div
            ref={panelRef}
            className={`drawer-content ${isDragging ? "dragging" : ""}`}
            style={{ width: `${panelSize}px` }}
          >
            <div
              className="panel-button"
              onMouseDown={handleMouseDown}
              role="slider"
              aria-label="Resize panel"
              tabIndex={-1}
            />
            <div className="panel-inner-content">{inspectorBody}</div>
          </div>
        </div>
      )}
    </>
  );
};

PanelRight.displayName = "PanelRight";

export default memo(PanelRight, isEqual);
