/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Drawer } from "@mui/material";
import {
  CloseButton,
  Divider,
  ToolbarIconButton,
  Tooltip,
  Box
} from "../ui_primitives";
import { useResizeBottomPanel } from "../../hooks/handlers/useResizeBottomPanel";
import {
  BOTTOM_PANEL_GROUPS,
  BottomPanelView,
  useBottomPanelStore
} from "../../stores/BottomPanelStore";
import { memo, useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";
import isEqual from "fast-deep-equal";
import TracePanel from "./TracePanel";
import LogPanel from "./LogPanel";
import JobsPanel from "./jobs/JobsPanel";
import SandboxesPanel from "../dashboard/SandboxesPanel";
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

// icons
import TimelineIcon from "@mui/icons-material/Timeline";
import ArticleIcon from "@mui/icons-material/Article";
import WorkHistoryIcon from "@mui/icons-material/WorkHistory";
import DesktopWindowsIcon from "@mui/icons-material/DesktopWindows";
import HistoryIcon from "@mui/icons-material/History";
import FolderIcon from "@mui/icons-material/Folder";

const workspacesEnabled = !isProduction;
const sandboxesEnabled = !isProduction;

const HEADER_HEIGHT = 36;

interface ViewSpec {
  id: BottomPanelView;
  label: string;
  icon: React.ReactNode;
  enabled: boolean;
}

const VIEW_SPECS: Record<BottomPanelView, ViewSpec> = {
  logs: { id: "logs", label: "Logs", icon: <ArticleIcon />, enabled: true },
  jobs: {
    id: "jobs",
    label: "Jobs",
    icon: <WorkHistoryIcon />,
    enabled: true
  },
  sandboxes: {
    id: "sandboxes",
    label: "Sandboxes",
    icon: <DesktopWindowsIcon />,
    enabled: sandboxesEnabled
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
      alignItems: "center",
      justifyContent: "space-between",
      gap: "8px",
      padding: "0 12px",
      backgroundColor: theme.vars.palette.background.default,
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      "& .tab-rail": {
        display: "flex",
        alignItems: "center",
        gap: "2px",
        overflowX: "auto",
        flex: 1,
        minWidth: 0,
        WebkitOverflowScrolling: "touch"
      },
      "& .tab-group": {
        display: "flex",
        alignItems: "center",
        gap: "2px"
      },
      "& .tab-group-divider": {
        height: "20px",
        margin: "0 6px",
        borderColor: theme.vars.palette.grey[800]
      },
      "& .tab-button": {
        padding: "4px 10px",
        borderRadius: "var(--rounded-md)",
        color: theme.vars.palette.text.secondary,
        fontSize: "0.78rem",
        lineHeight: 1.2,
        textTransform: "none",
        minWidth: "auto",
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        cursor: "pointer",
        backgroundColor: "transparent",
        border: "none",
        whiteSpace: "nowrap",
        transition: "background-color 0.15s ease, color 0.15s ease",
        "& svg": {
          fontSize: "0.95rem"
        },
        "&:hover": {
          backgroundColor: `${theme.vars.palette.action.hover}66`,
          color: theme.vars.palette.text.primary
        },
        "&.active": {
          backgroundColor: `${theme.vars.palette.action.selected}66`,
          color: theme.vars.palette.primary.main,
          boxShadow: `0 0 0 1px ${theme.vars.palette.primary.main}44 inset`
        }
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
  onClick: () => void;
}

const TabButton = memo(function TabButton({ spec, active, onClick }: TabButtonProps) {
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
    case "jobs":
      return (
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
      );
    case "sandboxes":
      return sandboxesEnabled ? <SandboxesPanel /> : null;
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
  const setVisibility = useBottomPanelStore((state) => state.setVisibility);

  useCombo(["Control", "Shift", "T"], () => handlePanelToggle("trace"), false);
  useCombo(["l"], () => handlePanelToggle("logs"), false);

  // Production-disabled-view safeguard: if a previous session persisted a
  // gated-off view (workspace/sandboxes), migrate the store to "logs" so the
  // active view and the rendered body stay in sync — otherwise the close
  // button would need two clicks (the first would just switch views).
  useEffect(() => {
    if (!VIEW_SPECS[activeView]?.enabled) {
      setActiveView("logs");
    }
  }, [activeView, setActiveView]);

  const handleClose = useCallback(() => {
    setVisibility(false);
  }, [setVisibility]);

  if (!path.startsWith("/editor")) {
    return null;
  }

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
          />
        )}
        <div className="panel-content">
          <div className="panel-header">
            <div className="tab-rail" role="tablist">
              {BOTTOM_PANEL_GROUPS.map((group, groupIdx) => {
                const enabledViews = group.views.filter(
                  (v) => VIEW_SPECS[v]?.enabled
                );
                if (enabledViews.length === 0) {
                  return null;
                }
                return (
                  <div key={group.id} style={{ display: "contents" }}>
                    {groupIdx > 0 && (
                      <Divider
                        orientation="vertical"
                        flexItem
                        className="tab-group-divider"
                      />
                    )}
                    <div className="tab-group" aria-label={group.label}>
                      {enabledViews.map((view) => (
                        <TabButton
                          key={view}
                          spec={VIEW_SPECS[view]}
                          active={isVisible && activeView === view}
                          onClick={() => handlePanelToggle(view)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            {isVisible && (
              <CloseButton
                onClick={handleClose}
                buttonSize="small"
                tooltip="Hide panel"
              />
            )}
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
