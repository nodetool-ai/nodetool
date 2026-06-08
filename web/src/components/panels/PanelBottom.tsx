/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Drawer } from "@mui/material";
import { Tooltip, Box } from "../ui_primitives";
import { useResizeBottomPanel } from "../../hooks/handlers/useResizeBottomPanel";
import {
  BOTTOM_PANEL_GROUPS,
  BottomPanelView,
  useBottomPanelStore
} from "../../stores/BottomPanelStore";
import { memo, useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import isEqual from "fast-deep-equal";
import TracePanel from "./TracePanel";
import LogPanel from "./LogPanel";
import QueuePanel from "./jobs/QueuePanel";
import SandboxesPanel from "../dashboard/SandboxesPanel";
import WorkersPanel from "../workers/WorkersPanel";
import WorkerStatusIndicator from "../workers/WorkerStatusIndicator";
import WorkspaceTree from "../workspaces/WorkspaceTree";
import { VersionHistoryPanel } from "../version";
import PanelHeadline from "../ui/PanelHeadline";
import { useCombo } from "../../stores/KeyPressedStore";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { isProduction } from "../../lib/env";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import ContextMenus from "../context_menus/ContextMenus";
import {
  Workflow,
  WorkflowVersion,
  Node as GraphNode,
  Edge as GraphEdge
} from "../../stores/ApiTypes";
import { useRunningJobs } from "../../hooks/useRunningJobs";
import { useSystemStatsStore } from "../../stores/systemStatsHandler";
import { globalWebSocketManager } from "../../lib/websocket/GlobalWebSocketManager";
import { BASE_URL } from "../../stores/BASE_URL";
import type { NodeStoreState } from "../../stores/NodeStore";

// icons
import TimelineIcon from "@mui/icons-material/Timeline";
import ArticleIcon from "@mui/icons-material/Article";
import DesktopWindowsIcon from "@mui/icons-material/DesktopWindows";
import HistoryIcon from "@mui/icons-material/History";
import FolderIcon from "@mui/icons-material/Folder";
import PlaylistPlayIcon from "@mui/icons-material/PlaylistPlay";
import MemoryIcon from "@mui/icons-material/Memory";

const workspacesEnabled = !isProduction;
const sandboxesEnabled = !isProduction;

const HEADER_HEIGHT = 32;

// Worker label derived from BASE_URL. Empty = local dev (Vite proxy → :7777).
const workerLabel = (() => {
  if (!BASE_URL) return "worker:local";
  try {
    return `worker:${new URL(BASE_URL).hostname}`;
  } catch {
    return "worker:remote";
  }
})();

const useWsConnected = (): boolean => {
  const [connected, setConnected] = useState(
    () => globalWebSocketManager.isConnectionOpen()
  );
  useEffect(() => {
    const sync = () => setConnected(globalWebSocketManager.isConnectionOpen());
    const offOpen = globalWebSocketManager.subscribeEvent("open", sync);
    const offClose = globalWebSocketManager.subscribeEvent("close", sync);
    const offState = globalWebSocketManager.subscribeEvent("stateChange", sync);
    sync();
    return () => {
      offOpen();
      offClose();
      offState();
    };
  }, []);
  return connected;
};

const useGraphCounts = (
  workflowId: string | null | undefined
): { nodes: number; edges: number } => {
  const nodeStore = useWorkflowManager((state) =>
    workflowId ? state.nodeStores[workflowId] : undefined
  );
  const [counts, setCounts] = useState<{ nodes: number; edges: number }>(() => {
    if (!nodeStore) return { nodes: 0, edges: 0 };
    const s = nodeStore.getState();
    return { nodes: s.nodes.length, edges: s.edges.length };
  });

  useEffect(() => {
    if (!nodeStore) {
      setCounts({ nodes: 0, edges: 0 });
      return;
    }
    const sync = (s: NodeStoreState) =>
      setCounts({ nodes: s.nodes.length, edges: s.edges.length });
    sync(nodeStore.getState());
    return nodeStore.subscribe((state: NodeStoreState, prev: NodeStoreState) => {
      if (state.nodes !== prev.nodes || state.edges !== prev.edges) {
        sync(state);
      }
    });
  }, [nodeStore]);

  return counts;
};

interface ViewSpec {
  id: BottomPanelView;
  label: string;
  icon: React.ReactNode;
  enabled: boolean;
}

const VIEW_SPECS: Record<BottomPanelView, ViewSpec> = {
  logs: { id: "logs", label: "Logs", icon: <ArticleIcon />, enabled: true },
  queue: {
    id: "queue",
    label: "Queue",
    icon: <PlaylistPlayIcon />,
    enabled: true
  },
  sandboxes: {
    id: "sandboxes",
    label: "Sandboxes",
    icon: <DesktopWindowsIcon />,
    enabled: sandboxesEnabled
  },
  workers: {
    id: "workers",
    label: "Workers",
    icon: <MemoryIcon />,
    enabled: true
  },
  versions: {
    id: "versions",
    label: "Versions",
    icon: <HistoryIcon />,
    enabled: true
  },
  workspace: {
    id: "workspace",
    label: "Workspace",
    icon: <FolderIcon />,
    enabled: workspacesEnabled
  },
  trace: {
    id: "trace",
    label: "Trace",
    icon: <TimelineIcon />,
    enabled: true
  }
};

const styles = (theme: Theme) =>
  css({
    position: "fixed",
    bottom: "0",
    left: "0",
    right: "0",
    zIndex: 1100,
    ".panel-container": {
      flexShrink: 0,
      position: "relative",
      backgroundColor: theme.vars.palette.background.default
    },
    ".panel-resize-button": {
      height: "6px",
      width: "100%",
      position: "absolute",
      zIndex: 1200,
      top: "-3px",
      left: "0",
      backgroundColor: "transparent",
      border: 0,
      borderRadius: 0,
      cursor: "ns-resize",
      transition: "all 0.2s ease",
      "&::before": {
        content: '""',
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "40px",
        height: "4px",
        borderRadius: "var(--rounded-xs)",
        backgroundColor: theme.vars.palette.grey[600],
        opacity: 0.5,
        transition: "all 0.2s ease"
      },
      "&:hover": {
        backgroundColor: theme.vars.palette.primary.main,
        boxShadow: `0 0 8px ${theme.vars.palette.primary.main}40`,
        transform: "scaleY(1.5)",
        "&::before": {
          opacity: 1,
          backgroundColor: theme.vars.palette.common.white
        }
      },
      "&:active": {
        backgroundColor: theme.vars.palette.primary.main,
        boxShadow: `0 0 12px ${theme.vars.palette.primary.main}60`,
        transform: "scaleY(2)",
        "&::before": {
          opacity: 1,
          backgroundColor: theme.vars.palette.common.white
        }
      }
    },
    ".panel-content": {
      display: "flex",
      flexDirection: "column",
      flex: 1,
      height: "100%",
      border: "0",
      minHeight: 0
    },
    ".panel-header": {
      height: `${HEADER_HEIGHT}px`,
      minHeight: `${HEADER_HEIGHT}px`,
      display: "flex",
      alignItems: "stretch",
      gap: 0,
      padding: 0,
      backgroundColor: theme.vars.palette.background.default,
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      fontSize: "var(--fontSizeSmall)",
      lineHeight: 1,
      color: theme.vars.palette.text.secondary,
      userSelect: "none",

      "& .status-cluster": {
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: "0 14px",
        flexShrink: 0,
        whiteSpace: "nowrap"
      },

      "& .status-dot": {
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        backgroundColor: theme.vars.palette.success.main,
        flexShrink: 0,
        boxShadow: `0 0 6px ${theme.vars.palette.success.main}99`,
        "&.disconnected": {
          backgroundColor: theme.vars.palette.text.disabled,
          boxShadow: "none"
        }
      },

      "& .sep": {
        color: theme.vars.palette.text.disabled,
        margin: "0 2px"
      },

      "& .tab-rail": {
        display: "flex",
        alignItems: "stretch",
        gap: 0,
        overflowX: "auto",
        flexShrink: 1,
        minWidth: 0,
        scrollbarWidth: "none",
        msOverflowStyle: "none",
        WebkitOverflowScrolling: "touch",
        "&::-webkit-scrollbar": { display: "none" }
      },

      "& .tab-button": {
        height: "100%",
        padding: "0 12px",
        color: theme.vars.palette.text.secondary,
        fontSize: "var(--fontSizeSmall)",
        lineHeight: 1,
        fontWeight: 400,
        textTransform: "none",
        minWidth: "auto",
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        cursor: "pointer",
        backgroundColor: "transparent",
        border: "none",
        whiteSpace: "nowrap",
        transition: "background-color 120ms, color 120ms",
        "& svg": {
          fontSize: "var(--fontSizeNormal)",
          color: theme.vars.palette.text.disabled
        },
        "&:hover": {
          backgroundColor: "rgba(255,255,255,0.03)",
          color: theme.vars.palette.text.primary,
          "& svg": { color: theme.vars.palette.text.secondary }
        },
        "&.active": {
          color: theme.vars.palette.text.primary,
          backgroundColor: "rgba(255,255,255,0.04)",
          "& svg": { color: theme.vars.palette.primary.main },
          "&::before": {
            content: '""',
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "1px",
            background: theme.vars.palette.primary.main
          }
        },
        position: "relative"
      },

      "& .tab-count": {
        color: theme.vars.palette.text.disabled,
        fontVariantNumeric: "tabular-nums",
        fontSize: "var(--fontSizeSmaller)"
      },

      "& .meta-cluster": {
        marginLeft: "auto",
        display: "inline-flex",
        alignItems: "center",
        gap: "12px",
        padding: "0 12px 0 16px",
        flexShrink: 0,
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums"
      },

      "& .meta-pair": {
        display: "inline-flex",
        alignItems: "center",
        gap: "6px"
      },

      "& .meta-key": {
        color: theme.vars.palette.text.disabled,
        textTransform: "lowercase"
      },

      "& .meta-value": {
        color: theme.vars.palette.text.secondary
      }
    },
    ".panel-body": {
      flex: 1,
      minHeight: 0,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    }
  });

interface TabButtonProps {
  spec: ViewSpec;
  active: boolean;
  count?: number;
  onClick: () => void;
}

const TabButton = memo(function TabButton({
  spec,
  active,
  count,
  onClick
}: TabButtonProps) {
  return (
    <Tooltip title={spec.label} placement="top" delay={TOOLTIP_ENTER_DELAY}>
      <button
        type="button"
        role="tab"
        aria-selected={active}
        className={`tab-button ${active ? "active" : ""}`}
        onClick={onClick}
      >
        {spec.icon}
        <span>{spec.label}</span>
        {count !== undefined && count > 0 && (
          <span className="tab-count">{count}</span>
        )}
      </button>
    </Tooltip>
  );
});

const PanelBodyContent = memo(function PanelBodyContent({
  activeView
}: {
  activeView: BottomPanelView;
}) {
  const currentWorkflowId = useWorkflowManager((state) => state.currentWorkflowId);
  const activeNodeStore = useWorkflowManager((state) =>
    state.currentWorkflowId
      ? state.nodeStores[state.currentWorkflowId]
      : undefined
  );

  const handleRestoreVersion = useCallback(
    async (version: WorkflowVersion) => {
      if (!activeNodeStore || !currentWorkflowId) {
        return;
      }
      const storeState = activeNodeStore.getState();
      const workflow = storeState.getWorkflow();

      const [{ graphNodeToReactFlowNode }, { graphEdgeToReactFlowEdge }] =
        await Promise.all([
          import("../../stores/graphNodeToReactFlowNode"),
          import("../../stores/graphEdgeToReactFlowEdge")
        ]);

      const graph = version.graph;
      const newNodes = graph.nodes.map((n) =>
        graphNodeToReactFlowNode(
          {
            ...workflow,
            graph: graph as unknown as Workflow["graph"]
          } as Workflow,
          n as GraphNode
        )
      );
      const newEdges = graph.edges.map((e) =>
        graphEdgeToReactFlowEdge(e as GraphEdge)
      );

      storeState.setNodes(newNodes);
      storeState.setEdges(newEdges);
      storeState.setWorkflowDirty(true);
    },
    [activeNodeStore, currentWorkflowId]
  );

  const closeView = useBottomPanelStore((s) => s.closePanel);

  switch (activeView) {
    case "logs":
      return <LogPanel />;
    case "queue":
      return (
        <Box
          className="queue-panel"
          sx={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            height: "100%",
            overflow: "hidden",
            padding: "0 1em"
          }}
        >
          <PanelHeadline title="Queue" />
          <QueuePanel />
        </Box>
      );
    case "sandboxes":
      return sandboxesEnabled ? <SandboxesPanel /> : null;
    case "workers":
      return <WorkersPanel />;
    case "versions":
      return currentWorkflowId ? (
        <VersionHistoryPanel
          workflowId={currentWorkflowId}
          onRestore={handleRestoreVersion}
          onClose={closeView}
        />
      ) : null;
    case "workspace":
      return workspacesEnabled ? (
        <Box
          className="workspace-panel"
          sx={{ width: "100%", height: "100%", overflow: "hidden" }}
        >
          <WorkspaceTree />
        </Box>
      ) : null;
    case "trace":
      return <TracePanel />;
    default:
      return null;
  }
});

const PanelBottom: React.FC = () => {
  const theme = useTheme();
  const path = useLocation().pathname;
  const {
    ref: panelRef,
    size: panelSize,
    isVisible,
    isDragging,
    handleMouseDown,
    handlePanelToggle
  } = useResizeBottomPanel();

  const activeView = useBottomPanelStore((state) => state.panel.activeView);
  const setActiveView = useBottomPanelStore((state) => state.setActiveView);

  const isConnected = useWsConnected();

  const currentWorkflowId = useWorkflowManager(
    (state) => state.currentWorkflowId
  );
  const { nodes: nodeCount, edges: edgeCount } = useGraphCounts(
    currentWorkflowId
  );

  const { data: allJobs } = useRunningJobs();
  const queuedCount =
    allJobs?.filter((j) => j.status === "queued").length ?? 0;

  const systemStats = useSystemStatsStore((state) => state.stats);

  useCombo(["Control", "Shift", "T"], () => handlePanelToggle("trace"), false);
  useCombo(["l"], () => handlePanelToggle("logs"), false);

  // Production-disabled-view safeguard: if a previous session persisted a
  // gated-off view (workspace/sandboxes), migrate the store to "logs" so the
  // active view and the rendered body stay in sync.
  useEffect(() => {
    if (!VIEW_SPECS[activeView]?.enabled) {
      setActiveView("logs");
    }
  }, [activeView, setActiveView]);

  // Shown in the legacy editor (/editor) and the unified workspace (/workspace).
  if (!path.startsWith("/editor") && !path.startsWith("/workspace")) {
    return null;
  }

  const enabledViews = BOTTOM_PANEL_GROUPS.flatMap((g) =>
    g.views.filter((v) => VIEW_SPECS[v]?.enabled)
  );

  const openHeight = isVisible
    ? Math.min(
        panelSize,
        typeof window !== "undefined"
          ? Math.max(200, window.innerHeight * 0.7)
          : panelSize
      )
    : HEADER_HEIGHT;

  return (
    <div
      css={styles(theme)}
      className="panel-container"
      style={{
        height: `${openHeight}px`
      }}
    >
      <Drawer
        className="panel-bottom-drawer"
        PaperProps={{
          ref: panelRef,
          className: `panel panel-bottom ${isDragging ? "dragging" : ""}`,
          style: {
            height: `${openHeight}px`,
            left: 0,
            right: 0,
            width: "100%",
            borderTop: `1px solid ${theme.vars.palette.divider}`,
            backgroundColor: theme.vars.palette.background.default,
            boxShadow: isVisible ? "0 -4px 10px rgba(0, 0, 0, 0.3)" : "none",
            overflow: "hidden",
            transition: "height 200ms ease"
          }
        }}
        variant="persistent"
        anchor="bottom"
        open={true}
      >
        {isVisible && (
          <div
            className="panel-resize-button"
            onMouseDown={handleMouseDown}
            style={{ cursor: isDragging ? "ns-resize" : "ns-resize" }}
            role="slider"
            aria-label="Resize panel"
            aria-valuenow={panelSize}
            aria-valuemin={40}
            aria-valuemax={600}
            tabIndex={-1}
          />
        )}
        <div className="panel-content">
          <div className="panel-header">
            <div
              className="status-cluster"
              role="status"
              aria-label={`Worker ${isConnected ? "connected" : "disconnected"}`}
            >
              <span
                className={`status-dot ${isConnected ? "" : "disconnected"}`}
                aria-hidden
              />
              <span>{isConnected ? "connected" : "offline"}</span>
              <span className="sep" aria-hidden>·</span>
              <span>{workerLabel}</span>
              <WorkerStatusIndicator />
            </div>
            <div className="tab-rail" role="tablist">
              {enabledViews.map((view) => (
                <TabButton
                  key={view}
                  spec={VIEW_SPECS[view]}
                  active={isVisible && activeView === view}
                  count={view === "queue" ? queuedCount : undefined}
                  onClick={() => handlePanelToggle(view)}
                />
              ))}
            </div>
            <div className="meta-cluster" aria-label="Workflow stats">
              {currentWorkflowId && (
                <span className="meta-pair">
                  <span className="meta-value">{nodeCount}</span>
                  <span className="meta-key">nodes</span>
                  <span className="sep" aria-hidden>·</span>
                  <span className="meta-value">{edgeCount}</span>
                  <span className="meta-key">edges</span>
                </span>
              )}
              {systemStats && (
                <>
                  <span className="meta-pair">
                    <span className="meta-key">cpu</span>
                    <span className="meta-value">
                      {Math.round(systemStats.cpu_percent)}%
                    </span>
                  </span>
                  <span className="meta-pair">
                    <span className="meta-key">mem</span>
                    <span className="meta-value">
                      {systemStats.memory_used_gb !== undefined
                        ? `${systemStats.memory_used_gb.toFixed(1)}G`
                        : `${Math.round(systemStats.memory_percent)}%`}
                    </span>
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="panel-body">
            {isVisible && (
              <ContextMenuProvider>
                <ContextMenus />
                <PanelBodyContent activeView={activeView} />
              </ContextMenuProvider>
            )}
          </div>
        </div>
      </Drawer>
    </div>
  );
};

PanelBottom.displayName = "PanelBottom";

export default memo(PanelBottom, isEqual);
