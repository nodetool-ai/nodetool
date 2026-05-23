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
import useMetadataStore from "../../stores/MetadataStore";
import { setFrontendToolRuntimeState } from "../../lib/tools/frontendToolRuntimeState";
import { getWorkflowRunnerStore } from "../../stores/WorkflowRunner";

import { TOOLBAR_WIDTH, PANEL_RESIZE_HANDLE_WIDTH } from "../../config/constants";
import ContextMenus from "../context_menus/ContextMenus";
import { MobileBottomSheet, ToolbarIconButton, Tooltip } from "../ui_primitives";

import CenterFocusWeakIcon from "@mui/icons-material/CenterFocusWeak";

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

    ".panel-inner-content": {
      display: "flex",
      flex: 1,
      height: "100%",
      overflow: "hidden"
    }
  });

const MOBILE_LAUNCHER_TOP = 48;

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

const PanelRight: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const {
    ref: panelRef,
    size: panelSize,
    isVisible,
    isDragging,
    handleMouseDown,
    handlePanelToggle
  } = useResizeRightPanel("right");

  const setVisibility = useRightPanelStore((state) => state.setVisibility);

  const activeNodeStore = useWorkflowManager((state) =>
    state.currentWorkflowId
      ? state.nodeStores[state.currentWorkflowId]
      : undefined
  );

  const handleInspectorToggle = useCallback(
    () => handlePanelToggle("inspector"),
    [handlePanelToggle]
  );

  const handleMobileSheetClose = useCallback(
    () => setVisibility(false),
    [setVisibility]
  );
  const handleMobileSheetOpen = useCallback(
    () => setVisibility(true),
    [setVisibility]
  );

  const inspectorBody = (
    <ContextMenuProvider>
      <ReactFlowProvider>
        {activeNodeStore && (
          <NodeContext.Provider value={activeNodeStore}>
            <ContextMenus />
            <Inspector />
          </NodeContext.Provider>
        )}
      </ReactFlowProvider>
    </ContextMenuProvider>
  );

  if (isMobile) {
    return (
      <>
        <FrontendToolRuntimeSync />
        <ToolbarIconButton
          icon={<CenterFocusWeakIcon />}
          tooltip={isVisible ? "Close inspector" : "Open inspector"}
          className="panel-right-mobile-launcher"
          active={isVisible}
          css={mobileLauncherStyles(theme)}
          onClick={isVisible ? handleMobileSheetClose : handleMobileSheetOpen}
          ariaLabel={isVisible ? "Close inspector" : "Open inspector"}
          aria-expanded={isVisible}
          tabIndex={-1}
        />
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
    <div css={styles(theme)} className="panel-right-container">
      <FrontendToolRuntimeSync />
      {isVisible && (
        <div
          ref={panelRef}
          className={`drawer-content ${isDragging ? "dragging" : ""}`}
          style={{ width: `${panelSize - TOOLBAR_WIDTH}px` }}
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
      )}

      <div className="vertical-toolbar">
        <Tooltip title="Inspector (I)" placement="left-start">
          <ToolbarIconButton
            icon={<CenterFocusWeakIcon />}
            onClick={handleInspectorToggle}
            ariaLabel="Toggle Inspector panel (I)"
            className="inspector"
            active={isVisible}
            tabIndex={-1}
          />
        </Tooltip>
      </div>
    </div>
  );
};

PanelRight.displayName = "PanelRight";

export default memo(PanelRight, isEqual);
