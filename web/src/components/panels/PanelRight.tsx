/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, IconButton, useMediaQuery } from "@mui/material";
import Inspector from "../Inspector";
import { useResizeRightPanel } from "../../hooks/handlers/useResizeRightPanel";
import { useRightPanelStore, type RightPanelView } from "../../stores/RightPanelStore";
import { memo, useCallback, useEffect } from "react";
import isEqual from "fast-deep-equal";
import { NodeContext } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useShallow } from "zustand/react/shallow";
import { useNavigate } from "react-router-dom";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import { ReactFlowProvider } from "@xyflow/react";
import { Workflow, WorkflowVersion, Node as GraphNode, Edge as GraphEdge } from "../../stores/ApiTypes";
import useMetadataStore from "../../stores/MetadataStore";
import { setFrontendToolRuntimeState } from "../../lib/tools/frontendToolRuntimeState";
import type { NodeStore } from "../../stores/NodeStore";
import { getWorkflowRunnerStore } from "../../stores/WorkflowRunner";

import { TOOLBAR_WIDTH, PANEL_RESIZE_HANDLE_WIDTH, TOOLTIP_ENTER_DELAY } from "../../config/constants";
import WorkflowAssistantChat from "./WorkflowAssistantChat";
import LogPanel from "./LogPanel";
import PanelHeadline from "../ui/PanelHeadline";

import WorkspaceTree from "../workspaces/WorkspaceTree";
import { VersionHistoryPanel } from "../version";
import ContextMenus from "../context_menus/ContextMenus";
import WorkflowForm from "../workflows/WorkflowForm";
import AgentPanel from "./AgentPanel";
import { MobileBottomSheet, Tooltip } from "../ui_primitives";

// Icons for mobile tab rail
import CenterFocusWeakIcon from "@mui/icons-material/CenterFocusWeak";
import ArticleIcon from "@mui/icons-material/Article";
import FolderIcon from "@mui/icons-material/Folder";
import HistoryIcon from "@mui/icons-material/History";
import SettingsIcon from "@mui/icons-material/Settings";
import WorkHistoryIcon from "@mui/icons-material/WorkHistory";
import FolderSpecialIcon from "@mui/icons-material/FolderSpecial";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import TuneIcon from "@mui/icons-material/Tune";
import SvgFileIcon from "../SvgFileIcon";

const HEADER_AREA_HEIGHT = 77; // Total header area offset (AppHeader + toolbar row)

const styles = (theme: Theme) =>
  css({
    // Main container - fixed to right edge of viewport
    position: "fixed",
    right: 0,
    top: `${HEADER_AREA_HEIGHT}px`,
    height: `calc(100vh - ${HEADER_AREA_HEIGHT}px)`,
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

/* ------------------------------------------------------------------ */
/*  ChatAgentPanel – renders either Workflow Chat or Agent directly    */
/* ------------------------------------------------------------------ */

interface ChatAgentPanelProps {
  activeTab: "assistant" | "agent";
  activeNodeStore: NodeStore | undefined;
}

const ChatAgentPanel = memo(function ChatAgentPanel({
  activeTab,
  activeNodeStore,
}: ChatAgentPanelProps) {
  if (activeTab === "assistant") {
    return activeNodeStore ? (
      <NodeContext.Provider value={activeNodeStore}>
        <WorkflowAssistantChat />
      </NodeContext.Provider>
    ) : null;
  }
  return <AgentPanel />;
});

/* ------------------------------------------------------------------ */
/*  MobilePanelRight – bottom-sheet variant used on small viewports    */
/* ------------------------------------------------------------------ */

const MOBILE_LAUNCHER_TOP = 48; // matches mobile AppHeader offset used in PanelLeft

const mobileLauncherStyles = (theme: Theme) =>
  css({
    position: "fixed",
    top: `${MOBILE_LAUNCHER_TOP}px`,
    right: 8,
    zIndex: 1100,
    backgroundColor: theme.vars.palette.background.paper,
    color: theme.vars.palette.text.primary,
    border: `1px solid ${theme.vars.palette.divider}`,
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
    padding: "8px",
    borderRadius: "10px",
    "&:hover": {
      backgroundColor: theme.vars.palette.action.hover
    },
    "&.active": {
      backgroundColor: theme.vars.palette.primary.main,
      color: theme.vars.palette.primary.contrastText,
      "&:hover": {
        backgroundColor: theme.vars.palette.primary.dark
      }
    },
    "& svg": {
      fontSize: "1.25rem"
    }
  });

const mobileTabRailStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexWrap: "nowrap",
    gap: "4px",
    padding: "8px 12px",
    overflowX: "auto",
    WebkitOverflowScrolling: "touch",
    "& .tab-button": {
      padding: "6px 10px",
      borderRadius: "var(--rounded-lg)",
      color: theme.vars.palette.text.secondary,
      minWidth: "auto",
      flexShrink: 0,
      "&.active": {
        backgroundColor: `${theme.vars.palette.action.selected}66`,
        color: theme.vars.palette.primary.main,
        boxShadow: `0 0 0 1px ${theme.vars.palette.primary.main}44 inset`
      },
      "& svg": {
        fontSize: "1.1rem"
      }
    }
  });

const RIGHT_VIEW_LABELS: Record<RightPanelView, string> = {
  inspector: "Inspector",
  assistant: "Assistant",
  agent: "Agent",
  workspace: "Workspace",
  versions: "Versions",
  workflow: "Settings",
  workflowAssets: "Assets",
  jobs: "Jobs",
  logs: "Logs"
};

interface MobilePanelRightProps {
  activeView: RightPanelView;
  isVisible: boolean;
  onOpen: () => void;
  onClose: () => void;
  setView: (view: RightPanelView) => void;
  children: React.ReactNode;
}

const MobilePanelRight: React.FC<MobilePanelRightProps> = ({
  activeView,
  isVisible,
  onOpen,
  onClose,
  setView,
  children
}) => {
  const theme = useTheme();

  const renderTabButton = (
    view: RightPanelView,
    label: string,
    icon: React.ReactNode
  ) => (
    <Tooltip title={label} placement="bottom" delay={TOOLTIP_ENTER_DELAY}>
      <IconButton
        className={`tab-button ${activeView === view ? "active" : ""}`}
        onClick={() => setView(view)}
        aria-label={label}
        tabIndex={-1}
      >
        {icon}
      </IconButton>
    </Tooltip>
  );

  return (
    <>
      <IconButton
        className={`panel-right-mobile-launcher ${isVisible ? "active" : ""}`}
        css={mobileLauncherStyles(theme)}
        onClick={isVisible ? onClose : onOpen}
        aria-label={isVisible ? "Close panel" : "Open inspector panel"}
        aria-expanded={isVisible}
        tabIndex={-1}
      >
        <TuneIcon />
      </IconButton>

      <MobileBottomSheet
        open={isVisible}
        onClose={onClose}
        title={RIGHT_VIEW_LABELS[activeView] ?? "Panel"}
        ariaLabel="Inspector and workflow panels"
        headerExtras={
          <div css={mobileTabRailStyles(theme)}>
            {renderTabButton("inspector", "Inspector", <CenterFocusWeakIcon />)}
            {renderTabButton(
              "assistant",
              "Assistant",
              <SvgFileIcon iconName="assistant" svgProp={{ width: 18, height: 18 }} />
            )}
            {renderTabButton("agent", "Agent", <SmartToyIcon />)}
            {renderTabButton("workspace", "Workspace", <FolderIcon />)}
            {renderTabButton("workflow", "Settings", <SettingsIcon />)}
            {renderTabButton("workflowAssets", "Assets", <FolderSpecialIcon />)}
            {renderTabButton("versions", "Versions", <HistoryIcon />)}
            {renderTabButton("logs", "Logs", <ArticleIcon />)}
            {renderTabButton("jobs", "Jobs", <WorkHistoryIcon />)}
          </div>
        }
      >
        <Box
          sx={{
            height: "65vh",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden"
          }}
        >
          {children}
        </Box>
      </MobileBottomSheet>
    </>
  );
};

MobilePanelRight.displayName = "MobilePanelRight";

const PanelRight: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
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
  const setVisibility = useRightPanelStore((state) => state.setVisibility);

  const activeNodeStore = useWorkflowManager((state) =>
    state.currentWorkflowId
      ? state.nodeStores[state.currentWorkflowId]
      : undefined
  );

  // Get the current workflow reactively for the WorkflowForm
  const currentWorkflow = useWorkflowManager((state) =>
    state.currentWorkflowId
      ? state.nodeStores[state.currentWorkflowId]?.getState().getWorkflow() ?? null
      : null
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
  } = useWorkflowManager(useShallow((state) => ({
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
  })));
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

  // Memoize toolbar toggle handlers to prevent unnecessary VerticalToolbar re-renders
  const handleInspectorToggle = useCallback(() => handlePanelToggle("inspector"), [handlePanelToggle]);
  const handleAssistantToggle = useCallback(() => handlePanelToggle("assistant"), [handlePanelToggle]);
  const handleLogsToggle = useCallback(() => handlePanelToggle("logs"), [handlePanelToggle]);
  const handleJobsToggle = useCallback(() => handlePanelToggle("jobs"), [handlePanelToggle]);
  const handleWorkspaceToggle = useCallback(() => handlePanelToggle("workspace"), [handlePanelToggle]);
  const handleVersionsToggle = useCallback(() => handlePanelToggle("versions"), [handlePanelToggle]);
  const handleWorkflowToggle = useCallback(() => handlePanelToggle("workflow"), [handlePanelToggle]);
  const handleWorkflowAssetsToggle = useCallback(() => handlePanelToggle("workflowAssets"), [handlePanelToggle]);
  const handleAgentToggle = useCallback(() => handlePanelToggle("agent"), [handlePanelToggle]);

  const handleMobileSheetClose = useCallback(
    () => setVisibility(false),
    [setVisibility]
  );
  const handleMobileSheetOpen = useCallback(
    () => setVisibility(true),
    [setVisibility]
  );
  const mobileSetView = useCallback(
    (view: RightPanelView) => {
      // On mobile, tapping a tab should always keep the sheet open and switch.
      setActiveView(view);
      setVisibility(true);
    },
    [setActiveView, setVisibility]
  );

  // The view-specific body is shared between desktop (in the fixed drawer) and
  // mobile (inside a bottom sheet).
  const panelBody = (
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
          activeNodeStore && currentWorkflowId && currentWorkflow ? (
            <Box
              className="workflow-panel"
              sx={{
                width: "100%",
                height: "100%",
                overflow: "auto"
              }}
            >
              <WorkflowForm
                workflow={currentWorkflow}
                onClose={handleWorkflowToggle}
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
          <ChatAgentPanel
            activeTab={activeView}
            activeNodeStore={activeNodeStore}
          />
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
  );

  if (isMobile) {
    return (
      <MobilePanelRight
        activeView={activeView}
        isVisible={isVisible}
        onOpen={handleMobileSheetOpen}
        onClose={handleMobileSheetClose}
        setView={mobileSetView}
      >
        {panelBody}
      </MobilePanelRight>
    );
  }

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
          <div className="panel-inner-content">{panelBody}</div>
        </div>
      )}

      {/* Fixed toolbar - always on the right edge */}
      <VerticalToolbar
        handleInspectorToggle={handleInspectorToggle}
        handleAssistantToggle={handleAssistantToggle}
        handleLogsToggle={handleLogsToggle}
        handleJobsToggle={handleJobsToggle}
        handleWorkspaceToggle={handleWorkspaceToggle}
        handleVersionsToggle={handleVersionsToggle}
        handleWorkflowToggle={handleWorkflowToggle}
        handleWorkflowAssetsToggle={handleWorkflowAssetsToggle}
        handleAgentToggle={handleAgentToggle}
        activeView={activeView}
        panelVisible={isVisible}
      />
    </div>
  );
};

PanelRight.displayName = "PanelRight";

export default memo(PanelRight, isEqual);
