/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box } from "@mui/material";
import Inspector from "../Inspector";
import { useResizeRightPanel } from "../../hooks/handlers/useResizeRightPanel";
import { useRightPanelStore } from "../../stores/RightPanelStore";
import { memo } from "react";
import isEqual from "lodash/isEqual";
import { NodeContext } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import { ReactFlowProvider } from "@xyflow/react";
import { Workflow, WorkflowVersion, Node as GraphNode, Edge as GraphEdge } from "../../stores/ApiTypes";


// icons
import WorkflowAssistantChat from "./WorkflowAssistantChat";
import LogPanel from "./LogPanel";
import PanelHeadline from "../ui/PanelHeadline";

import WorkspaceTree from "../workspaces/WorkspaceTree";
import { VersionHistoryPanel } from "../version"; import ContextMenus from "../context_menus/ContextMenus";
import WorkflowForm from "../workflows/WorkflowForm";

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
import { WorkflowNotesPanel } from "../notes/WorkflowNotesPanel";

const PanelRight: React.FC = () => {
  const theme = useTheme();
  const {
    ref: panelRef,
    size: panelSize,
    isVisible,
    isDragging,
    handleMouseDown,
    handlePanelToggle
  } = useResizeRightPanel("right");

  const activeView = useRightPanelStore((state) => state.panel.activeView);

  const activeNodeStore = useWorkflowManager((state) =>
    state.currentWorkflowId
      ? state.nodeStores[state.currentWorkflowId]
      : undefined
  );
  const currentWorkflowId = useWorkflowManager((state) => state.currentWorkflowId);

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
                    <Box className="workflow-assets-panel-inner"  sx={{ flex: 1, overflow: "hidden" }}>
                      <WorkflowAssetPanel />
                    </Box>
                  </Box>
                ) : activeView === "notes" ? (
                  currentWorkflowId ? (
                    <WorkflowNotesPanel
                      workflowId={currentWorkflowId}
                      onClose={() => handlePanelToggle("notes")}
                    />
                  ) : null
                ) : (
                  activeNodeStore && (
                    <NodeContext.Provider value={activeNodeStore}>
                      <ContextMenus />
                      {activeView === "inspector" && <Inspector />}
                      {activeView === "assistant" && <WorkflowAssistantChat />}
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
        handleNotesToggle={() => handlePanelToggle("notes")}
        activeView={activeView}
        panelVisible={isVisible}
      />
    </div>
  );
};

export default memo(PanelRight, isEqual);
