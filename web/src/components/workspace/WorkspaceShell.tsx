/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { Suspense, useEffect, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { usePanelStore } from "../../stores/PanelStore";
import { useWorkspaceMenuShortcuts } from "../../hooks/useWorkspaceMenuShortcuts";
import {
  HEADER_HEIGHT,
  TOOLBAR_WIDTH,
  LEFT_PANEL_MIN_DRAWER_WIDTH
} from "../../config/constants";
import WorkspaceTabBar from "./WorkspaceTabBar";
import TabContent from "./TabContent";
import { Caption } from "../ui_primitives";

const ACTIVE_TAB_STYLE: React.CSSProperties = {
  opacity: 1,
  pointerEvents: "auto",
  zIndex: 1
};
const INACTIVE_TAB_STYLE: React.CSSProperties = {
  opacity: 0,
  pointerEvents: "none",
  zIndex: 0
};

const PanelLeft = React.lazy(() => import("../panels/PanelLeft"));
const PanelRight = React.lazy(() => import("../panels/PanelRight"));
const PanelBottom = React.lazy(() => import("../panels/PanelBottom"));
const Alert = React.lazy(() => import("../node_editor/Alert"));

// PanelBottom keeps a 32px tab strip docked even when collapsed; the content
// area must sit above it. (PanelBottom's own HEADER_HEIGHT — kept in sync here.)
const BOTTOM_STRIP_HEIGHT = 32;

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    minHeight: 0,
    // Publish the unified chrome height so the viewport-fixed side panels
    // align with the single top bar. PanelRight (inspector) sits below the bar;
    // the left rail runs full-height to top 0. Legacy layouts set neither var
    // and keep their own fallback offsets.
    "--workspace-header-height": `${HEADER_HEIGHT}px`,
    "--workspace-rail-top": "0px",
    backgroundColor: "var(--c_editor_bg_color)",

    "& .workspace-main": {
      flex: 1,
      display: "flex",
      position: "relative",
      minHeight: 0,
      minWidth: 0
    },
    "& .workspace-center": {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      minHeight: 0,
      minWidth: 0
    },
    "& .workspace-content": {
      flex: 1,
      position: "relative",
      overflow: "hidden",
      minHeight: 0,
      minWidth: 0,
      marginLeft: `${TOOLBAR_WIDTH}px`,
      marginBottom: `${BOTTOM_STRIP_HEIGHT}px`
    },
    "& .tab-layer": {
      position: "absolute",
      inset: 0,
      display: "flex",
      flexDirection: "column",
      minHeight: 0,
      minWidth: 0
    },
    "& .workspace-empty": {
      position: "absolute",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      padding: theme.spacing(0, 3),
      color: theme.vars.palette.text.secondary
    }
  });

/**
 * The unified tabbed-document workspace, wrapped in the app chrome (tab bar,
 * left nav, bottom panel). The center keeps every open tab mounted (active
 * shown, others hidden) so editor state survives tab switches. The node
 * editor's docked inspector renders only while a workflow Edit tab is active.
 */
const WorkspaceShell = () => {
  const theme = useTheme();
  const shellStyles = useMemo(() => styles(theme), [theme]);
  const tabs = useWorkspaceTabsStore((state) => state.tabs);
  const activeTabId = useWorkspaceTabsStore((state) => state.activeTabId);
  const setTitle = useWorkspaceTabsStore((state) => state.setTitle);
  const setCurrentWorkflowId = useWorkflowManager(
    (state) => state.setCurrentWorkflowId
  );
  const openWorkflows = useWorkflowManager((state) => state.openWorkflows);
  const panelVisible = usePanelStore((state) => state.panel.isVisible);
  const panelSize = usePanelStore((state) => state.panel.panelSize);

  // Cmd+W ("Close Tab") closes the active tab for every surface, not just the
  // node editor.
  useWorkspaceMenuShortcuts();

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [tabs, activeTabId]
  );

  // The left rail (PanelLeft) is position:fixed, so its open drawer normally
  // floats over the content. For the timeline that covers the start of the
  // tracks and makes dropping assets onto them hard, so when a timeline tab is
  // active we reserve the drawer's width and let the content sit beside it.
  // Other surfaces (node editor, etc.) keep the overlay so the canvas stays
  // full-bleed. The width here mirrors PanelLeft's drawer sizing.
  const contentMarginLeft =
    activeTab?.type === "timeline" && panelVisible
      ? TOOLBAR_WIDTH +
        Math.max(panelSize - TOOLBAR_WIDTH, LEFT_PANEL_MIN_DRAWER_WIDTH)
      : TOOLBAR_WIDTH;

  // Keep the WorkflowManager's "current workflow" aligned with the active
  // workflow tab so the docked panels and run state target the right graph.
  useEffect(() => {
    if (activeTab?.type === "workflow") {
      setCurrentWorkflowId(activeTab.ref);
    }
  }, [activeTab, setCurrentWorkflowId]);

  // Keep workflow tab titles in sync with their loaded workflow names.
  useEffect(() => {
    openWorkflows.forEach((wf) => setTitle(wf.id, "workflow", wf.name));
  }, [openWorkflows, setTitle]);

  const showWorkflowEditChrome =
    activeTab?.type === "workflow" && activeTab.mode === "edit";

  return (
    <div css={shellStyles} className="workspace-shell">
      <WorkspaceTabBar />
      <div className="workspace-main">
        <Suspense fallback={null}>
          <PanelLeft />
        </Suspense>

        <div className="workspace-center">
          <div
            className="workspace-content"
            style={{ marginLeft: contentMarginLeft }}
          >
            {tabs.length === 0 && (
              <div className="workspace-empty">
                <Caption color="secondary">
                  No tabs open — use + to open or create a document.
                </Caption>
              </div>
            )}
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              return (
                <div
                  key={tab.id}
                  className="tab-layer"
                  style={isActive ? ACTIVE_TAB_STYLE : INACTIVE_TAB_STYLE}
                >
                  <TabContent tab={tab} active={isActive} />
                </div>
              );
            })}
          </div>
        </div>

        <Suspense fallback={null}>
          <PanelBottom />
        </Suspense>

        {showWorkflowEditChrome && (
          <Suspense fallback={null}>
            <PanelRight />
            <Alert />
          </Suspense>
        )}
      </div>
    </div>
  );
};

export default WorkspaceShell;
