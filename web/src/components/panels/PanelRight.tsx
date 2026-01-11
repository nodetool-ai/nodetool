/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Drawer, Tooltip, IconButton, Box } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
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
import CenterFocusWeakIcon from "@mui/icons-material/CenterFocusWeak";
import ArticleIcon from "@mui/icons-material/Article";
import DescriptionIcon from "@mui/icons-material/Description";
import FolderIcon from "@mui/icons-material/Folder";
import HistoryIcon from "@mui/icons-material/History";
import SvgFileIcon from "../SvgFileIcon";
import WorkflowAssistantChat from "./WorkflowAssistantChat";
import LogPanel from "./LogPanel";
import PanelResizeButton from "./PanelResizeButton";
import WorkspaceTree from "../workspaces/WorkspaceTree";
import { VersionHistoryPanel } from "../version";
import ContextMenus from "../context_menus/ContextMenus";
import WorkflowDocumentationPanel from "../documentation/WorkflowDocumentationPanel";

const PANEL_WIDTH_COLLAPSED = "52px";
const HEADER_HEIGHT = 77;
const styles = (theme: Theme) =>
  css({
    position: "absolute",
    right: "0",
    ".panel-container": {
      flexShrink: 0,
      position: "absolute",
      backgroundColor: theme.vars.palette.background.default
    },
    ".panel-right": {
      boxShadow: "0 4px 10px rgba(0, 0, 0, 0.3)",
      borderLeft: "none",
      backgroundColor: theme.vars.palette.background.default,
      position: "absolute",
      overflow: "hidden",
      width: "100%",
      padding: "0",
      top: `${HEADER_HEIGHT}px`,
      height: `calc(100vh - ${HEADER_HEIGHT}px)`
    },

    ".panel-button": {
      width: "30px",
      position: "absolute",
      zIndex: 1200,
      height: "calc(100vh - 83px)",
      backgroundColor: "transparent",
      border: 0,
      borderRadius: 0,
      top: "80px",
      cursor: "e-resize",
      transition: "background-color 0.3s ease",

      "& svg": {
        display: "block",
        width: "18px",
        height: "18px",
        fontSize: "18px !important",
        color: "var(--palette-grey-200)",
        opacity: 0,
        marginLeft: "1px",
        transition: "all 0.5s ease"
      },

      "&:hover": {
        backgroundColor: "var(--palette-grey-800)",
        "& svg": {
          opacity: 1
        }
      }
    },
    ".vertical-toolbar": {
      width: "50px",
      display: "flex",
      flexDirection: "column",
      gap: 0,
      backgroundColor: "transparent",
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
    ".panel-content": {
      display: "flex",
      flex: 1,
      height: "100%",
      marginTop: "10px",
      border: "0"
    }
  });

const VerticalToolbar = memo(function VerticalToolbar({
  handleInspectorToggle,
  handleAssistantToggle,
  handleLogsToggle,
  handleWorkspaceToggle,
  handleVersionsToggle,
  handleDocumentationToggle,
  activeView,
  panelVisible
}: {
  handleInspectorToggle: () => void;
  handleAssistantToggle: () => void;
  handleLogsToggle: () => void;
  handleWorkspaceToggle: () => void;
  handleVersionsToggle: () => void;
  handleDocumentationToggle: () => void;
  activeView: "inspector" | "assistant" | "logs" | "workspace" | "versions" | "documentation";
  panelVisible: boolean;
}) {
  return (
    <div className="vertical-toolbar">
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

      {/* Documentation Button */}
      <Tooltip
        title={
          <div className="tooltip-span">
            <div className="tooltip-title">Documentation</div>
            <div className="tooltip-key">
              <kbd>D</kbd>
            </div>
          </div>
        }
        placement="left-start"
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <IconButton
          tabIndex={-1}
          onClick={handleDocumentationToggle}
          className={
            activeView === "documentation" && panelVisible
              ? "documentation active"
              : "documentation"
          }
        >
          <DescriptionIcon />
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
    <div
      css={styles(theme)}
      className="panel-container"
      style={{ width: isVisible ? `${panelSize}px` : "60px" }}
    >
      <PanelResizeButton
        side="right"
        isVisible={isVisible}
        panelSize={panelSize}
        onMouseDown={handleMouseDown}
      />
      <Drawer
        className="panel-right-drawer"
        PaperProps={{
          ref: panelRef,
          className: `panel panel-right ${isDragging ? "dragging" : ""}`,
          style: {
            width: isVisible ? `${panelSize}px` : PANEL_WIDTH_COLLAPSED,
            height: isVisible ? "calc(100vh - 80px)" : "220px",
            backgroundColor: isVisible ? undefined : "transparent",
            border: "none",
            borderLeft: isVisible
              ? `1px solid ${theme.vars.palette.divider}`
              : "none",
            boxShadow: isVisible ? "0 2px 16px rgba(0, 0, 0, 0.1)" : "none"
          }
        }}
        variant="persistent"
        anchor="right"
        open={true}
      >
        <div className="panel-content">
          <VerticalToolbar
            handleInspectorToggle={() => handlePanelToggle("inspector")}
            handleAssistantToggle={() => handlePanelToggle("assistant")}
            handleLogsToggle={() => handlePanelToggle("logs")}
            handleWorkspaceToggle={() => handlePanelToggle("workspace")}
            handleVersionsToggle={() => handlePanelToggle("versions")}
            handleDocumentationToggle={() => handlePanelToggle("documentation")}
            activeView={activeView}
            panelVisible={isVisible}
          />
          {isVisible && (
            <ContextMenuProvider>
              <ReactFlowProvider>
                {activeView === "logs" ? (
                  <LogPanel />
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
                ) : activeView === "documentation" ? (
                  <WorkflowDocumentationPanel
                    onClose={() => handlePanelToggle("documentation")}
                  />
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
          )}
        </div>
      </Drawer>
    </div>
  );
};

export default memo(PanelRight, isEqual);
