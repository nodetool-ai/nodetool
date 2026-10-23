/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { Suspense, useEffect, useMemo, useRef } from "react";
import { useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  isTabInScope,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { usePanelStore } from "../../stores/PanelStore";
import { useBottomPanelStore } from "../../stores/BottomPanelStore";
import {
  bottomPanelHeight,
  BOTTOM_PANEL_STRIP_HEIGHT
} from "../../hooks/handlers/useResizeBottomPanel";
import { useGenerationActivityTracking } from "../../hooks/useGenerationActivityTracking";
import { useWorkspaceMenuShortcuts } from "../../hooks/useWorkspaceMenuShortcuts";
import { useWorkspaceDocumentTitle } from "../../hooks/useWorkspaceDocumentTitle";
import {
  HEADER_HEIGHT,
  TOOLBAR_WIDTH,
  LEFT_PANEL_MIN_DRAWER_WIDTH
} from "../../config/constants";
import { LoadingSpinner, MOTION, reducedMotion } from "../ui_primitives";
import WorkspaceTabBar from "./WorkspaceTabBar";
import TabContent from "./TabContent";
import WorkspaceTabLayer from "./WorkspaceTabLayer";
import { WorkspaceHeaderActionsProvider } from "./WorkspaceHeaderActionsContext";

import FrontendToolRuntimeSync from "../panels/FrontendToolRuntimeSync";

const NewProjectSurface = React.lazy(
  () => import("../projects/NewProjectSurface")
);
const PanelLeft = React.lazy(() => import("../panels/PanelLeft"));
const PanelRight = React.lazy(() => import("../panels/PanelRight"));
const PanelBottom = React.lazy(() => import("../panels/PanelBottom"));
const Alert = React.lazy(() => import("../node_editor/Alert"));


const styles = (theme: Theme, isDragging: boolean) =>
  css({
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    minHeight: 0,
    // Publish the chrome height so the viewport-fixed side panels align with
    // the tab bar. PanelRight (inspector) sits below the bar; the left rail
    // runs full-height to top 0. Legacy layouts set neither var and keep
    // their own fallback offsets.
    "--workspace-header-height": `${HEADER_HEIGHT}px`,
    "--workspace-rail-top": "0px",
    backgroundColor: "var(--c_editor_bg_color)",

    // A guided flow keeps the left panel. A flow inside a workflow tab sits
    // beside the open drawer, like every non-canvas surface, instead of under
    // it.
    "&:has(.tab-layer:not([inert]) [data-setup-flow])": {
      "& .workspace-content": {
        marginLeft: "var(--workspace-drawer-gutter) !important"
      },
      "& .workspace-main": {
        "--workspace-content-left": "var(--workspace-drawer-gutter) !important"
      }
    },

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
      // PanelBottom is viewport-fixed. The content sits above it, collapsed
      // strip or open panel, so an open panel never covers a composer, a
      // board's actions or a canvas's controls.
      marginBottom: `var(--workspace-bottom-gutter, ${BOTTOM_PANEL_STRIP_HEIGHT}px)`,
      transition: isDragging
        ? "none"
        : `margin-left ${MOTION.slow}, margin-bottom ${MOTION.normal}`,
      ...reducedMotion({ transition: MOTION.none }),
      // On mobile the left rail is a floating hamburger and the bottom panel
      // is hidden, so neither gutter exists.
      [theme.breakpoints.down("sm")]: {
        marginBottom: 0
      }
    },
    "&[data-bottom-dragging] .workspace-content": {
      transition: "none"
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
/** The left margin that keeps content beside the left rail and its drawer. */
const drawerGutter = (
  isMobile: boolean,
  panelVisible: boolean,
  panelSize: number
): number => {
  if (isMobile) {
    return 0;
  }
  if (!panelVisible) {
    return TOOLBAR_WIDTH;
  }
  return (
    TOOLBAR_WIDTH +
    Math.max(panelSize - TOOLBAR_WIDTH, LEFT_PANEL_MIN_DRAWER_WIDTH)
  );
};

const WorkspaceShell = () => {
  const theme = useTheme();
  const shellRef = useRef<HTMLDivElement>(null);
  const panelVisible = usePanelStore((state) => state.panel.isVisible);
  const isDragging = usePanelStore((state) => state.panel.isDragging);
  const shellStyles = useMemo(
    () => styles(theme, !!isDragging),
    [theme, isDragging]
  );
  const tabs = useWorkspaceTabsStore((state) => state.tabs);
  const activeProjectId = useWorkspaceTabsStore(
    (state) => state.activeProjectId
  );
  const activeTabId = useWorkspaceTabsStore((state) => state.activeTabId);
  const setTitle = useWorkspaceTabsStore((state) => state.setTitle);
  useWorkspaceDocumentTitle();
  const setCurrentWorkflowId = useWorkflowManager(
    (state) => state.setCurrentWorkflowId
  );
  const openWorkflows = useWorkflowManager((state) => state.openWorkflows);
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  // Cmd+W ("Close Tab") closes the active tab for every surface, not just the
  // node editor.
  useWorkspaceMenuShortcuts();

  const activeTab = useMemo(
    () =>
      tabs.find(
        (tab) => tab.id === activeTabId && isTabInScope(tab, activeProjectId)
      ) ?? null,
    [activeProjectId, tabs, activeTabId]
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
  const contentMarginLeft = drawerGutter(
    isMobile,
    needsDrawerGutter,
    drawerWidth
  );

  // A guided flow in a workflow tab needs the drawer gutter too, but which
  // tab shows a flow is only known to CSS. Publish the gutter as a variable
  // written outside React, so a drag on the canvas does not re-render the
  // shell.
  useEffect(() => {
    const write = (): void => {
      const { isVisible, panelSize } = usePanelStore.getState().panel;
      shellRef.current?.style.setProperty(
        "--workspace-drawer-gutter",
        `${drawerGutter(isMobile, isVisible, panelSize)}px`
      );
    };
    write();
    return usePanelStore.subscribe(write);
  }, [isMobile]);

  // The bottom panel's height, published the same way: a drag on its handle
  // moves the content with it without re-rendering the shell.
  useEffect(() => {
    const write = (): void => {
      const { isVisible, panelSize, isDragging } =
        useBottomPanelStore.getState().panel;
      const shell = shellRef.current;
      if (!shell) {
        return;
      }
      shell.style.setProperty(
        "--workspace-bottom-gutter",
        `${bottomPanelHeight(isVisible, panelSize, window.innerHeight)}px`
      );
      shell.toggleAttribute("data-bottom-dragging", !!isDragging);
    };
    write();
    window.addEventListener("resize", write);
    const unsubscribe = useBottomPanelStore.subscribe(write);
    return () => {
      window.removeEventListener("resize", write);
      unsubscribe();
    };
  }, []);

  useGenerationActivityTracking();

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
    <WorkspaceHeaderActionsProvider>
      <div ref={shellRef} css={shellStyles} className="workspace-shell">
        {/* The guided game/workflow flows build their graphs through the same
          `ui_*` tools an agent drives, from tabs (e.g. New Project) where the
          editor chrome — and its own sync — is not mounted. Without this the
          build fails with "Frontend tool runtime state is not initialized". */}
        <FrontendToolRuntimeSync />
        <WorkspaceTabBar />
        {/* PanelBottom is viewport-fixed; it reads this offset so the left rail
          does not cover the start of its tab strip and panel content. */}
        <div
          className="workspace-main"
          style={{ "--workspace-content-left": `${contentMarginLeft}px` } as React.CSSProperties}
        >
          <Suspense fallback={null}>
            <PanelLeft />
          </Suspense>

          <div className="workspace-center">
            <div
              className="workspace-content"
              style={{ marginLeft: contentMarginLeft }}
            >
              {!activeTab && (
                <div className="workspace-empty">
                  <Suspense fallback={<LoadingSpinner />}>
                    <NewProjectSurface />
                  </Suspense>
                </div>
              )}
              {tabs.map((tab) => {
                const isActive =
                  tab.id === activeTabId && isTabInScope(tab, activeProjectId);
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
            </Suspense>
          )}

          {/* Notification popups belong to every tab type, not only the
              workflow editor. */}
          <Suspense fallback={null}>
            <Alert inspectorShown={showWorkflowEditChrome} />
          </Suspense>
        </div>
      </div>
    </WorkspaceHeaderActionsProvider>
  );
};

export default WorkspaceShell;
