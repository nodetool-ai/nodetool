/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box } from "@mui/material";
import Inspector from "../Inspector";
import { useResizeRightPanel } from "../../hooks/handlers/useResizeRightPanel";
import { useRightPanelStore, type RightPanelView } from "../../stores/RightPanelStore";
import { memo, useCallback, useEffect } from "react";
import isEqual from "lodash/isEqual";
import { NodeContext } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useNavigate } from "react-router-dom";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import { ReactFlowProvider } from "@xyflow/react";
import { Workflow, WorkflowVersion, Node as GraphNode, Edge as GraphEdge } from "../../stores/ApiTypes";
import useMetadataStore from "../../stores/MetadataStore";
import { setFrontendToolRuntimeState } from "../../lib/tools/frontendToolRuntimeState";
import type { NodeStore } from "../../stores/NodeStore";
import { getWorkflowRunnerStore } from "../../stores/WorkflowRunner";

import WorkflowAssistantChat from "./WorkflowAssistantChat";
import LogPanel from "./LogPanel";
import PanelHeadline from "../ui/PanelHeadline";

import WorkspaceTree from "../workspaces/WorkspaceTree";
import { VersionHistoryPanel } from "../version";
import ContextMenus from "../context_menus/ContextMenus";
import WorkflowForm from "../workflows/WorkflowForm";
import AgentPanel from "./AgentPanel";

const TOOLBAR_WIDTH = 50;
const HEADER_HEIGHT = 77;
const styles = (theme: Theme) =>
  css({
    // Main container - fixed to right edge of viewport
    position: "fixed",
    right: 0,
    top: `${HEADER_HEIGHT}px`,
    height: `calc(100vh - ${HEADER_HEIGHT}px)`,
    display: "flex",
    flexDirection: "row",
    zIndex: 1100,

    // Drawer content area (appears left of toolbar)
    ".drawer-content": {
      height: "100%",
      backgroundColor: theme.vars.palette.background.default,
      borderLeft: `1px solid ${theme.vars.palette.divider}`,
      boxShadow: "-4px 0 8px rgba(0, 0, 0, 0.05)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    },

    // Resize handle on left edge of drawer
    ".panel-button": {
      width: "6px",
      position: "absolute",
      left: 0,
      top: 0,
      height: "100%",
      backgroundColor: "transparent",
      border: 0,
      borderRadius: 0,
      cursor: "ew-resize",
      zIndex: 10,
      transition: "background-color 0.2s ease",

      "&:hover": {
        backgroundColor: theme.vars.palette.primary.main
      }
    },

    // Fixed toolbar on the right edge
    ".vertical-toolbar": {
      width: `${TOOLBAR_WIDTH}px`,
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
      gap: 0,
      backgroundColor: theme.vars.palette.background.default,
      borderLeft: `1px solid ${theme.vars.palette.divider}`,
      paddingTop: "8px",

      "& .MuiIconButton-root": {
        padding: "14px",
        borderRadius: "5px",
        position: "relative",
        transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "&.active svg": {
          color: "var(--palette-primary-main)"
        },
        "& svg": {
          display: "block",
          width: "18px",
          height: "18px",
          fontSize: "18px"
        }
      }
    },

    // Inner content wrapper
    ".panel-inner-content": {
      display: "flex",
      flex: 1,
      height: "100%",
      overflow: "hidden"
    }
  });

import WorkflowAssetPanel from "../assets/panels/WorkflowAssetPanel";
import JobsPanel from "./jobs/JobsPanel";
import VerticalToolbar from "./VerticalToolbar";
import WorkflowStats from "./WorkflowStats";
import { CommentPanel } from "../comments";

/* ------------------------------------------------------------------ */
/*  ChatAgentTabbedPanel – tab pills for "Workflow Chat" and "Agent"   */
/* ------------------------------------------------------------------ */

const tabbedPanelStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    overflow: "hidden",

    ".tab-bar": {
      display: "flex",
      alignItems: "center",
      gap: "2px",
      padding: "8px 12px 4px",
      flexShrink: 0
    },

    ".tab-pills": {
      display: "flex",
      alignItems: "center",
      gap: "2px",
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: "1em",
      height: "1.7em",
      padding: "0 2px"
    },

    ".tab-pill": {
      padding: "4px 14px",
      borderRadius: "14px",
      fontWeight: 500,
      letterSpacing: "0.02em",
      color: theme.vars.palette.text.secondary,
      minWidth: "auto",
      textTransform: "none",
      fontSize: theme.fontSizeSmall,
      transition: "all 0.2s ease-out",
      border: "none",
      backgroundColor: "transparent",
      cursor: "pointer",
      whiteSpace: "nowrap" as const,
      "&:hover": {
        backgroundColor: "rgba(255, 255, 255, 0.06)",
        color: theme.vars.palette.text.primary
      },
      "&.active": {
        backgroundColor: "rgba(255, 255, 255, 0.10)",
        color: theme.vars.palette.text.primary,
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12)"
      }
    },

    ".tab-content": {
      flex: 1,
      overflow: "hidden",
      minHeight: 0
    }
  });

interface ChatAgentTabbedPanelProps {
  activeTab: "assistant" | "agent";
  onTabChange: (tab: RightPanelView) => void;
  activeNodeStore: NodeStore | undefined;
}

const ChatAgentTabbedPanel = memo(function ChatAgentTabbedPanel({
  activeTab,
  onTabChange,
  activeNodeStore
}: ChatAgentTabbedPanelProps) {
  const theme = useTheme();

  const handleAssistantClick = useCallback(() => {
    if (activeTab !== "assistant") {
      onTabChange("assistant");
    }
  }, [activeTab, onTabChange]);

  const handleAgentClick = useCallback(() => {
    if (activeTab !== "agent") {
      onTabChange("agent");
    }
  }, [activeTab, onTabChange]);

  return (
    <Box css={tabbedPanelStyles(theme)} className="chat-agent-tabbed-panel">
      <div className="tab-bar">
        <div className="tab-pills">
          <button
            className={`tab-pill ${activeTab === "assistant" ? "active" : ""}`}
            onClick={handleAssistantClick}
          >
            Workflow Chat
          </button>
          <button
            className={`tab-pill ${activeTab === "agent" ? "active" : ""}`}
            onClick={handleAgentClick}
          >
            Agent
          </button>
        </div>
      </div>
      <div className="tab-content">
        {activeTab === "assistant" ? (
          activeNodeStore ? (
            <NodeContext.Provider value={activeNodeStore}>
              <WorkflowAssistantChat />
            </NodeContext.Provider>
          ) : null
        ) : (
          <AgentPanel />
        )}
      </div>
    </Box>
  );
});

const PanelRight: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const {
    ref: panelRef,
    size: panelSize,
    isVisible,
    isDragging,
    handleMouseDown,
    handlePanelToggle
  } = useResizeRightPanel("right");

  const activeView = useRightPanelStore((state) => state.panel.activeView);
  const setActiveView = useRightPanelStore((state) => state.setActiveView);

  const activeNodeStore = useWorkflowManager((state) =>
    state.currentWorkflowId
      ? state.nodeStores[state.currentWorkflowId]
      : undefined
  );
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
    copy,
  } = useWorkflowManager((state) => ({
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
    copy: state.copy,
  }));
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
      const workflow = (await fetchWorkflow(workflowId)) ?? getWorkflow(workflowId);
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
      copy,
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
    copy,
  ]);

  const handleRestoreVersion = async (version: WorkflowVersion) => {
    if (!activeNodeStore || !currentWorkflowId) {
      return;
    }

    const storeState = activeNodeStore.getState();
    const workflow = storeState.getWorkflow();

    const [{ graphNodeToReactFlowNode }, { graphEdgeToReactFlowEdge }] = await Promise.all([
      import("../../stores/graphNodeToReactFlowNode"),
      import("../../stores/graphEdgeToReactFlowEdge")
    ]);

    const graph = version.graph;
    const newNodes = graph.nodes.map((n) =>
      graphNodeToReactFlowNode(
        { ...workflow, graph: graph as unknown as Workflow["graph"] } as Workflow,
        n as GraphNode
      )
    );
    const newEdges = graph.edges.map((e) =>
      graphEdgeToReactFlowEdge(e as GraphEdge)
    );

    storeState.setNodes(newNodes);
    storeState.setEdges(newEdges);
    storeState.setWorkflowDirty(true);
  };

  return (
    <div css={styles(theme)} className="panel-right-container">
      {/* Drawer content - appears left of toolbar when visible */}
      {isVisible && (
        <div
          ref={panelRef}
          className={`drawer-content ${isDragging ? "dragging" : ""}`}
          style={{ width: `${panelSize - TOOLBAR_WIDTH}px` }}
        >
          {/* Resize handle on left edge */}
          <div
            className="panel-button"
            onMouseDown={handleMouseDown}
            role="slider"
            aria-label="Resize panel"
            tabIndex={-1}
          />
          <div className="panel-inner-content">
            <ContextMenuProvider>
              <ReactFlowProvider>
                {activeView === "logs" ? (
                  <LogPanel />
                ) : activeView === "jobs" ? (
                  <Box
                    className="jobs-panel"
                    sx={{
                      width: "100%",
                      height: "100%",
                      overflow: "auto",
                      padding: "0 1em"
                    }}
                  >
                    <PanelHeadline title="Jobs" />
                    <JobsPanel />
                  </Box>
                ) : activeView === "workspace" ? (
                  <Box
                    className="workspace-panel"
                    sx={{
                      width: "100%",
                      height: "100%",
                      overflow: "hidden"
                    }}
                  >
                    <WorkspaceTree />
                  </Box>
                ) : activeView === "versions" ? (
                  currentWorkflowId ? (
                    <VersionHistoryPanel
                      workflowId={currentWorkflowId}
                      onRestore={handleRestoreVersion}
                      onClose={() => handlePanelToggle("versions")}
                    />
                  ) : null
                ) : activeView === "workflow" ? (
                  activeNodeStore && currentWorkflowId ? (
                    <Box
                      className="workflow-panel"
                      sx={{
                        width: "100%",
                        height: "100%",
                        overflow: "auto"
                      }}
                    >
                      <WorkflowForm
                        workflow={activeNodeStore.getState().getWorkflow()}
                        onClose={() => handlePanelToggle("workflow")}
                      />
                    </Box>
                  ) : null
                ) : activeView === "workflowAssets" ? (
                  <Box
                    className="workflow-assets-panel"
                    sx={{
                      width: "100%",
                      height: "100%",
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: "column",
                      padding: "0 1em"
                    }}
                  >
                    <PanelHeadline title="Workflow Assets" />
                    <Box className="workflow-assets-panel-inner" sx={{ flex: 1, overflow: "hidden" }}>
                      <WorkflowAssetPanel />
                    </Box>
                  </Box>
                ) : (activeView === "assistant" || activeView === "agent") ? (
                  <ChatAgentTabbedPanel
                    activeTab={activeView}
                    onTabChange={(tab: RightPanelView) => setActiveView(tab)}
                    activeNodeStore={activeNodeStore}
                  />
                ) : activeView === "stats" ? (
                  activeNodeStore && (
                    <NodeContext.Provider value={activeNodeStore}>
                      <WorkflowStats />
                    </NodeContext.Provider>
                  )
                ) : activeView === "comments" ? (
                  <Box
                    className="comments-panel"
                    sx={{
                      width: "100%",
                      height: "100%",
                      overflow: "hidden"
                    }}
                  >
                    <CommentPanel />
                  </Box>
                ) : (
                  activeNodeStore && (
                    <NodeContext.Provider value={activeNodeStore}>
                      <ContextMenus />
                      {activeView === "inspector" && <Inspector />}
                    </NodeContext.Provider>
                  )
                )}
              </ReactFlowProvider>
            </ContextMenuProvider>
          </div>
        </div>
      )}

      {/* Fixed toolbar - always on the right edge */}
      <VerticalToolbar
        handleInspectorToggle={() => handlePanelToggle("inspector")}
        handleAssistantToggle={() => handlePanelToggle("assistant")}
        handleLogsToggle={() => handlePanelToggle("logs")}
        handleJobsToggle={() => handlePanelToggle("jobs")}
        handleWorkspaceToggle={() => handlePanelToggle("workspace")}
        handleVersionsToggle={() => handlePanelToggle("versions")}
        handleWorkflowToggle={() => handlePanelToggle("workflow")}
        handleWorkflowAssetsToggle={() => handlePanelToggle("workflowAssets")}
        handleAgentToggle={() => handlePanelToggle("agent")}
        handleStatsToggle={() => handlePanelToggle("stats")}
        handleCommentsToggle={() => handlePanelToggle("comments")}
        activeView={activeView}
        panelVisible={isVisible}
      />
    </div>
  );
};

export default memo(PanelRight, isEqual);
