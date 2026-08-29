/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { Suspense, useEffect, useMemo } from "react";
import { useMediaQuery } from "@mui/material";
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
import { MOTION, reducedMotion } from "../ui_primitives";
import WorkspaceTabBar from "./WorkspaceTabBar";
import TabContent from "./TabContent";
import WorkspaceTabLayer from "./WorkspaceTabLayer";

const NewProjectSurface = React.lazy(
  () => import("../projects/NewProjectSurface")
);
const PanelLeft = React.lazy(() => import("../panels/PanelLeft"));
const PanelRight = React.lazy(() => import("../panels/PanelRight"));
const PanelBottom = React.lazy(() => import("../panels/PanelBottom"));
const Alert = React.lazy(() => import("../node_editor/Alert"));

// PanelBottom keeps a 32px tab strip docked even when collapsed; the content
// area must sit above it. (PanelBottom's own HEADER_HEIGHT — kept in sync here.)
const BOTTOM_STRIP_HEIGHT = 32;

const styles = (theme: Theme, isDragging: boolean) =>
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
      marginBottom: `${BOTTOM_STRIP_HEIGHT}px`,
      transition: isDragging ? "none" : `margin-left ${MOTION.slow}`,
      ...reducedMotion({ transition: MOTION.none }),
      // On mobile the left rail is a floating hamburger and the bottom panel
      // is hidden, so neither gutter exists.
      [theme.breakpoints.down("sm")]: {
        marginBottom: 0
      }
    },
    "& .tab-layer, & .workspace-empty": {
      position: "absolute",
      inset: 0,
      display: "flex",
      flexDirection: "column",
      minHeight: 0,
      minWidth: 0
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
  const panelVisible = usePanelStore((state) => state.panel.isVisible);
  const isDragging = usePanelStore((state) => state.panel.isDragging);
  const shellStyles = useMemo(
    () => styles(theme, !!isDragging),
    [theme, isDragging]
  );
  const tabs = useWorkspaceTabsStore((state) => state.tabs);
  const activeTabId = useWorkspaceTabsStore((state) => state.activeTabId);
  const setTitle = useWorkspaceTabsStore((state) => state.setTitle);
  const setCurrentWorkflowId = useWorkflowManager(
    (state) => state.setCurrentWorkflowId
  );
  const openWorkflows = useWorkflowManager((state) => state.openWorkflows);
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  // Cmd+W ("Close Tab") closes the active tab for every surface, not just the
  // node editor.
  useWorkspaceMenuShortcuts();

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [tabs, activeTabId]
  );

  // The left rail (PanelLeft) is position:fixed, so its open drawer normally
  // floats over the content. The node canvas keeps the overlay so it stays
  // full-bleed; every other surface reserves the drawer's width and sits
  // beside it so the panel does not cover the content.
  // On mobile PanelLeft renders as a floating hamburger + bottom sheet, so
  // there is no rail to clear — the content runs full-bleed.
  const needsDrawerGutter =
    !isMobile &&
    panelVisible &&
    !(activeTab?.type === "workflow" && activeTab.mode === "edit");
  // Read the size only in that case: subscribing unconditionally re-rendered
  // the shell on every pointer frame of a left-panel drag.
  const drawerWidth = usePanelStore((state) =>
    needsDrawerGutter ? state.panel.panelSize : 0
  );
  const contentMarginLeft = isMobile
    ? 0
    : needsDrawerGutter
      ? TOOLBAR_WIDTH +
        Math.max(drawerWidth - TOOLBAR_WIDTH, LEFT_PANEL_MIN_DRAWER_WIDTH)
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
                <Suspense fallback={null}>
                  <NewProjectSurface />
                </Suspense>
              </div>
            )}
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              return (
                <WorkspaceTabLayer key={tab.id} active={isActive}>
                  <TabContent tab={tab} active={isActive} />
                </WorkspaceTabLayer>
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
