/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Tooltip, IconButton, Box, Divider, Typography, List, ListItem, ListItemText, ListItemIcon, CircularProgress } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import Inspector from "../Inspector";
import { useResizeRightPanel } from "../../hooks/handlers/useResizeRightPanel";
import { useRightPanelStore } from "../../stores/RightPanelStore";
import { memo, useState, useEffect } from "react";
import isEqual from "lodash/isEqual";
import { NodeContext } from "../../contexts/NodeContext";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import { ReactFlowProvider } from "@xyflow/react";
import { Workflow, WorkflowVersion, Node as GraphNode, Edge as GraphEdge, Job } from "../../stores/ApiTypes";
import { useNavigate } from "react-router-dom";

// icons
import CenterFocusWeakIcon from "@mui/icons-material/CenterFocusWeak";
import ArticleIcon from "@mui/icons-material/Article";
import FolderIcon from "@mui/icons-material/Folder";
import HistoryIcon from "@mui/icons-material/History";
import SettingsIcon from "@mui/icons-material/Settings";
import WorkHistoryIcon from "@mui/icons-material/WorkHistory";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import SvgFileIcon from "../SvgFileIcon";
import WorkflowAssistantChat from "./WorkflowAssistantChat";
import LogPanel from "./LogPanel";
import PanelHeadline from "../ui/PanelHeadline";

import WorkspaceTree from "../workspaces/WorkspaceTree";
import { VersionHistoryPanel } from "../version";
import ContextMenus from "../context_menus/ContextMenus";
import WorkflowForm from "../workflows/WorkflowForm";
import { useRunningJobs } from "../../hooks/useRunningJobs";
import { useWorkflowRunnerState } from "../../hooks/useWorkflowRunnerState";
import { useWorkflow } from "../../serverState/useWorkflow";
import { queryClient } from "../../queryClient";
import { getWorkflowRunnerStore } from "../../stores/WorkflowRunner";

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
      boxShadow: "-4px 0 10px rgba(0, 0, 0, 0.15)",
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

/**
 * Format elapsed time since job started
 */
const formatElapsedTime = (startedAt: string | null | undefined): string => {
  if (!startedAt) { return "Not started"; }
  const start = new Date(startedAt).getTime();
  if (isNaN(start)) { return "Invalid date"; }
  const now = Date.now();
  const elapsed = Math.floor((now - start) / 1000);
  if (elapsed < 0) { return "0s"; }
  if (elapsed < 60) { return `${elapsed}s`; }
  if (elapsed < 3600) { return `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`; }
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

/**
 * Component to display a single job item
 */
const JobItem = ({ job }: { job: Job }) => {
  const navigate = useNavigate();
  const runnerState = useWorkflowRunnerState(job.workflow_id);
  const { data: workflow } = useWorkflow(job.workflow_id);
  const [elapsedTime, setElapsedTime] = useState(formatElapsedTime(job.started_at));

  useEffect(() => {
    if (job.status !== "running" && job.status !== "queued") { return; }
    const interval = setInterval(() => {
      setElapsedTime(formatElapsedTime(job.started_at));
    }, 1000);
    return () => clearInterval(interval);
  }, [job.started_at, job.status]);

  useEffect(() => {
    if (runnerState === "idle" || runnerState === "error" || runnerState === "cancelled") {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    }
  }, [runnerState]);

  const handleClick = () => navigate(`/editor/${job.workflow_id}`);

  const handleStop = (e: React.MouseEvent) => {
    e.stopPropagation();
    const runnerStore = getWorkflowRunnerStore(job.workflow_id);
    runnerStore.getState().cancel();
  };

  const getStatusIcon = () => {
    if (job.error) {return <ErrorOutlineIcon color="error" />;}
    switch (job.status) {
      case "running": return <CircularProgress size={24} />;
      case "queued":
      case "starting": return <HourglassEmptyIcon color="action" />;
      default: return <PlayArrowIcon color="action" />;
    }
  };

  const workflowName = workflow?.name || "Loading...";
  const statusText = job.status === "running" ? `Running • ${elapsedTime}`
    : job.status === "queued" ? "Queued"
    : job.status === "starting" ? "Starting..."
    : job.status;

  return (
    <ListItem
      onClick={handleClick}
      sx={{ cursor: "pointer", borderRadius: 1, mb: 0.5, "&:hover": { backgroundColor: "action.hover" } }}
    >
      <ListItemIcon sx={{ minWidth: 40 }}>{getStatusIcon()}</ListItemIcon>
      <ListItemText
        primary={<Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>{workflowName}</Typography>}
        secondary={
          <Box component="span" sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
            <Typography variant="caption" color="text.secondary">{statusText}</Typography>
            {job.error && <Typography variant="caption" color="error" noWrap>{job.error}</Typography>}
          </Box>
        }
      />
      {(job.status === "running" || job.status === "queued" || job.status === "starting") && (
        <IconButton size="small" onClick={handleStop} sx={{ ml: 1, color: "error.main", "&:hover": { backgroundColor: "error.light", color: "error.contrastText" } }}>
          <StopIcon fontSize="small" />
        </IconButton>
      )}
    </ListItem>
  );
};

const RunningJobsList = () => {
  const { data: jobs, isLoading, error } = useRunningJobs();

  if (isLoading) {
    return <Box sx={{ display: "flex", justifyContent: "center", p: 2 }}><CircularProgress size={24} /></Box>;
  }
  if (error) {
    return <Box sx={{ p: 2, color: "error.main" }}><Typography variant="body2">Error loading jobs</Typography></Box>;
  }
  if (!jobs?.length) {
    return <Box sx={{ p: 5, color: "text.secondary" }}><Typography variant="body2">No running jobs</Typography></Box>;
  }

  return (
    <List sx={{ px: 1 }}>
      {jobs.map((job) => <JobItem key={job.id} job={job} />)}
    </List>
  );
};

const VerticalToolbar = memo(function VerticalToolbar({
  handleInspectorToggle,
  handleAssistantToggle,
  handleLogsToggle,
  handleJobsToggle,
  handleWorkspaceToggle,
  handleVersionsToggle,
  handleWorkflowToggle,
  activeView,
  panelVisible
}: {
  handleInspectorToggle: () => void;
  handleAssistantToggle: () => void;
  handleLogsToggle: () => void;
  handleJobsToggle: () => void;
  handleWorkspaceToggle: () => void;
  handleVersionsToggle: () => void;
  handleWorkflowToggle: () => void;
  activeView: "inspector" | "assistant" | "logs" | "workspace" | "versions" | "workflow" | "jobs";
  panelVisible: boolean;
}) {
  return (
    <div className="vertical-toolbar">
      {/* Workflow Tools Section */}
      {/* Inspector Button */}
      <Tooltip
        title={
          <div className="tooltip-span">
            <div className="tooltip-title">Inspector</div>
            <div className="tooltip-key">
              <kbd>I</kbd>
            </div>
          </div>
        }
        placement="left-start"
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <IconButton
          tabIndex={-1}
          onClick={handleInspectorToggle}
          className={
            activeView === "inspector" && panelVisible
              ? "inspector active"
              : "inspector"
          }
        >
          <CenterFocusWeakIcon />
        </IconButton>
      </Tooltip>

      {/* Assistant Button */}
      <Tooltip
        title={
          <div className="tooltip-span">
            <div className="tooltip-title">Operator</div>
            <div className="tooltip-key">
              <kbd>O</kbd>
            </div>
          </div>
        }
        placement="left-start"
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <IconButton
          tabIndex={-1}
          onClick={handleAssistantToggle}
          className={
            activeView === "assistant" && panelVisible
              ? "assistant active"
              : "assistant"
          }
        >
          <SvgFileIcon
            iconName="assistant"
            svgProp={{ width: 18, height: 18 }}
          />
        </IconButton>
      </Tooltip>

      {/* Workspace Button */}
      <Tooltip
        title="Workspace"
        placement="left-start"
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <IconButton
          tabIndex={-1}
          onClick={handleWorkspaceToggle}
          className={
            activeView === "workspace" && panelVisible
              ? "workspace active"
              : "workspace"
          }
        >
          <FolderIcon />
        </IconButton>
      </Tooltip>

      {/* Versions Button */}
      <Tooltip
        title="Version History"
        placement="left-start"
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <IconButton
          tabIndex={-1}
          onClick={handleVersionsToggle}
          className={
            activeView === "versions" && panelVisible
              ? "versions active"
              : "versions"
          }
        >
          <HistoryIcon />
        </IconButton>
      </Tooltip>

      {/* Workflow Settings Button */}
      <Tooltip
        title={
          <div className="tooltip-span">
            <div className="tooltip-title">Workflow Settings</div>
            <div className="tooltip-key">
              <kbd>W</kbd>
            </div>
          </div>
        }
        placement="left-start"
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <IconButton
          tabIndex={-1}
          onClick={handleWorkflowToggle}
          className={
            activeView === "workflow" && panelVisible
              ? "workflow active"
              : "workflow"
          }
        >
          <SettingsIcon />
        </IconButton>
      </Tooltip>

      {/* Spacer to push runtime section to bottom */}
      <div style={{ flexGrow: 1 }} />

      {/* Divider between workflow tools and runtime section */}
      <Divider sx={{ my: 1, mx: "6px", borderColor: "rgba(255, 255, 255, 0.15)" }} />

      {/* Runtime Section - Logs and Jobs */}
      {/* Logs Button */}
      <Tooltip
        title={
          <div className="tooltip-span">
            <div className="tooltip-title">Logs</div>
            <div className="tooltip-key">
              <kbd>L</kbd>
            </div>
          </div>
        }
        placement="left-start"
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <IconButton
          tabIndex={-1}
          onClick={handleLogsToggle}
          className={
            activeView === "logs" && panelVisible ? "logs active" : "logs"
          }
        >
          <ArticleIcon />
        </IconButton>
      </Tooltip>

      {/* Jobs Button */}
      <Tooltip
        title="Running Jobs"
        placement="left-start"
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <IconButton
          tabIndex={-1}
          onClick={handleJobsToggle}
          className={
            activeView === "jobs" && panelVisible ? "jobs active" : "jobs"
          }
        >
          <WorkHistoryIcon />
        </IconButton>
      </Tooltip>
    </div>
  );
});

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
                    sx={{
                      width: "100%",
                      height: "100%",
                      overflow: "auto",
                      padding: "0 1em"
                    }}
                  >
                    <PanelHeadline title="Running Jobs" />
                    <RunningJobsList />
                  </Box>
                ) : activeView === "workspace" ? (
                  <Box
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
        activeView={activeView}
        panelVisible={isVisible}
      />
    </div>
  );
};

export default memo(PanelRight, isEqual);
