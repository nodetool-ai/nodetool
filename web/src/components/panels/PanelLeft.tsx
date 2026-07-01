/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  useMediaQuery
} from "@mui/material";
import { ToolbarIconButton, FlexColumn, Box, Z_INDEX, SPACING, getSpacingPx } from "../ui_primitives";
import { useResizePanel } from "../../hooks/handlers/useResizePanel";
import { BORDER_RADIUS } from "../ui_primitives";
import isEqual from "fast-deep-equal";
import { memo, useCallback, useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import AssetGrid from "../assets/AssetGrid";
import {
  AssetGridStoreProvider,
  LIBRARY_ASSET_GRID_STORE_KEY
} from "../../stores/AssetGridStore";
import WorkflowList from "../workflows/WorkflowList";
import WorkflowForm from "../workflows/WorkflowForm";
import CreateWorkflowButton from "../workflows/CreateWorkflowButton";
import TimelineListPanel, { CreateTimelineButton } from "../timeline/TimelineListPanel";
import SketchListPanel, { CreateSketchButton } from "../sketch/SketchListPanel";
import HistoryTilesPanel from "../node_menu/HistoryTilesPanel";
import FavoritesTiles from "../node_menu/FavoritesTiles";
import QuickAccessSidebar from "../node_menu/QuickAccessSidebar";
import NodeLibrary from "../node_menu/NodeLibrary";
import RailAppMenu from "./RailAppMenu";

import { IconForType } from "../../config/IconForType";
import {
  LeftPanelView,
  NodeCategoryId,
  usePanelStore
} from "../../stores/PanelStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import {
  LEFT_PANEL_TOP_LEVEL,
  getTopLevelCategory
} from "../../config/quickAccessCategories";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import ContextMenus from "../context_menus/ContextMenus";
import { useLocation, useNavigate } from "react-router-dom";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLBAR_WIDTH,
  PANEL_RESIZE_HANDLE_WIDTH,
  LEFT_PANEL_MIN_DRAWER_WIDTH
} from "../../config/constants";
import ThemeToggle from "../ui/ThemeToggle";
import PanelHeadline from "../ui/PanelHeadline";
import { ScrollArea, Tooltip, MobileBottomSheet, MOTION } from "../ui_primitives";
import MenuIcon from "@mui/icons-material/Menu";
import CodeIcon from "@mui/icons-material/Code";
import GridViewIcon from "@mui/icons-material/GridView";
import CollectionsOutlinedIcon from "@mui/icons-material/CollectionsOutlined";

import { Fullscreen } from "@mui/icons-material";

const HEADER_HEIGHT = 77;
const HEADER_HEIGHT_MOBILE = 40;

// On the global chat route the rail only offers Assets — everything else is
// hidden (stable reference for memo).
const CHAT_ROUTE_HIDDEN_VIEWS: readonly LeftPanelView[] = LEFT_PANEL_TOP_LEVEL.filter(
  (cat) => cat.id !== "assets"
).map((cat) => cat.id);

const WORKFLOW_EDIT_ONLY_VIEWS: readonly LeftPanelView[] = [
  "nodes",
  "settings",
  "history",
  "favorites"
];

const isWorkflowEditOnlyView = (view: string): view is LeftPanelView =>
  (WORKFLOW_EDIT_ONLY_VIEWS as readonly string[]).includes(view);

const styles = (
  theme: Theme,
  hasHeader: boolean = true,
  isMobile: boolean = false
) => {
  const headerHeight = hasHeader
    ? isMobile
      ? HEADER_HEIGHT_MOBILE
      : HEADER_HEIGHT
    : 0;
  return css({
    position: "fixed",
    left: 0,
    // In the workspace shell the rail runs full-height (top 0) with the top
    // bar inset to its right. Legacy layouts have no var and keep their offset.
    top: `var(--workspace-rail-top, ${headerHeight}px)`,
    height: `calc(100vh - var(--workspace-rail-top, ${headerHeight}px))`,
    display: "flex",
    flexDirection: "row",
    zIndex: theme.zIndex.appBar,
    // The container is a full-height positioning shell. Its transparent box
    // overlaps the tab bar's empty strip above the drawer (the drawer's 40px
    // marginTop), so it must not capture clicks — only its real children do.
    pointerEvents: "none",

    ".drawer-content": {
      pointerEvents: "auto",
      marginTop: getSpacingPx(10), // 40px
      height: "calc(100% - 40px)",
      backgroundColor: theme.vars.palette.background.default,
      borderRight: `1px solid ${theme.vars.palette.divider}`,
      boxShadow: "4px 0 8px rgba(0, 0, 0, 0.05)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    },

    ".panel-resize-handle": {
      width: `${PANEL_RESIZE_HANDLE_WIDTH}px`,
      position: "absolute",
      right: 0,
      top: 0,
      height: "100%",
      backgroundColor: "transparent",
      border: 0,
      borderRadius: 0,
      cursor: "ew-resize",
      zIndex: Z_INDEX.dropdown,
      transition: MOTION.all,

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
      pointerEvents: "auto",
      width: `${TOOLBAR_WIDTH}px`,
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.md),
      backgroundColor: theme.vars.palette.background.default,
      borderRight: `1px solid ${theme.vars.palette.divider}`,
      paddingTop: getSpacingPx(SPACING.lg), // was 10px
      paddingBottom: getSpacingPx(SPACING.lg), // was 10px

      "& .toolbar-divider": {
        height: "1px",
        margin: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.lg)}`, // was 8px 10px
        backgroundColor: theme.vars.palette.divider
      },

      "& .MuiIconButton-root, .MuiButton-root": {
        padding: `${theme.spacing(1)}`,
        margin: `0 ${theme.spacing(0.75)}`,
        borderRadius: BORDER_RADIUS.lg,
        backgroundColor: "transparent",
        transition: `${MOTION.background}, color ${MOTION.fast}`,

        "& svg": {
          fontSize: "var(--fontSizeBig)",
          color: theme.vars.palette.text.secondary,
          transition: `color ${MOTION.fast}`
        },

        "&:hover": {
          backgroundColor: theme.vars.palette.action.hover,
          "& svg": {
            color: theme.vars.palette.text.primary
          }
        },

        "&.active": {
          backgroundColor: theme.vars.palette.action.selected,
          "& svg": {
            color: theme.vars.palette.text.primary
          }
        },

        "&:focus-visible": {
          outline: `2px solid ${theme.vars.palette.primary.main}`,
          outlineOffset: "-2px"
        }
      }
    },

    ".panel-inner-content": {
      display: "flex",
      flex: 1,
      height: "100%",
      overflow: "hidden",
      padding: isMobile ? 0 : "0 0.75em"
    },
    // The node library manages its own internal spacing and its info strip
    // bleeds to the panel borders, so it forgoes the shared horizontal padding.
    "&.is-nodes .panel-inner-content": {
      padding: 0
    }
  });
};

const VerticalToolbar = memo(function VerticalToolbar({
  activeView,
  onViewChange,
  handlePanelToggle,
  showAppMenu = false,
  hiddenViews
}: {
  activeView: string;
  onViewChange: (view: LeftPanelView) => void;
  handlePanelToggle: () => void;
  showAppMenu?: boolean;
  hiddenViews?: readonly LeftPanelView[];
}) {
  const panelVisible = usePanelStore((state) => state.panel.isVisible);
  const currentWorkflow = useWorkflowManager((state) =>
    state.currentWorkflowId
      ? state.nodeStores[state.currentWorkflowId]?.getState().getWorkflow() ??
        null
      : null
  );

  // Sidebar shows the view as "active" only when the panel is open and
  // that view is selected.
  const renderedActive: LeftPanelView | "" =
    panelVisible && LEFT_PANEL_TOP_LEVEL.some((c) => c.id === activeView)
      ? (activeView as LeftPanelView)
      : "";

  const labelOverrides = useMemo(
    () => (currentWorkflow ? { assets: "Workflow Output" } : undefined),
    [currentWorkflow]
  );

  return (
    <div className="vertical-toolbar">
      {showAppMenu && (
        <>
          <RailAppMenu />
          <div className="toolbar-divider" aria-hidden />
        </>
      )}
      <QuickAccessSidebar
        activeCategory={renderedActive}
        onCategoryClick={onViewChange}
        hiddenViews={hiddenViews}
        labelOverrides={labelOverrides}
      />
      <div style={{ flexGrow: 1 }} />
      <div className="toolbar-divider" aria-hidden />
      <ThemeToggle />
      <Tooltip title="Toggle Panel" placement="right-start">
        <ToolbarIconButton
          tabIndex={-1}
          ariaLabel="Toggle panel"
          onClick={handlePanelToggle}
          icon={<CodeIcon />}
        />
      </Tooltip>
    </div>
  );
});

const PanelContent = memo(function PanelContent({
  activeView,
  activeNodeCategory,
  setActiveNodeCategory,
  handlePanelToggle,
  isMobile = false
}: {
  activeView: string;
  activeNodeCategory: NodeCategoryId;
  setActiveNodeCategory: (id: NodeCategoryId) => void;
  handlePanelToggle: (view: LeftPanelView) => void;
  isMobile?: boolean;
}) {
  const navigate = useNavigate();
  const path = useLocation().pathname;
  const currentWorkflow = useWorkflowManager((state) =>
    state.currentWorkflowId
      ? state.nodeStores[state.currentWorkflowId]?.getState().getWorkflow() ??
        null
      : null
  );
  const setVisibility = usePanelStore((state) => state.setVisibility);
  const closePanel = useCallback(() => setVisibility(false), [setVisibility]);

  const handleFullscreenClick = useCallback(() => {
    navigate("/assets");
    handlePanelToggle("assets");
  }, [navigate, handlePanelToggle]);

  if (activeView === "nodes") {
    return (
      <NodeLibrary
        activeSubcategory={activeNodeCategory}
        onSubcategoryChange={setActiveNodeCategory}
        isMobile={isMobile}
      />
    );
  }

  return (
    <>
      {activeView === "history" && (
        <FlexColumn
          className="history-panel-container"
          fullWidth
          fullHeight
          sx={{
            overflow: "hidden"
          }}
        >
          {!isMobile && <PanelHeadline title="History" />}
          <HistoryTilesPanel />
        </FlexColumn>
      )}
      {activeView === "favorites" && (
        <FlexColumn
          className="favorites-panel-container"
          fullWidth
          fullHeight
          sx={{
            overflow: "hidden"
          }}
        >
          {!isMobile && <PanelHeadline title="Favorites" />}
          <ScrollArea fullHeight>
            <FavoritesTiles showEmpty hideHeader />
          </ScrollArea>
        </FlexColumn>
      )}
      {activeView === "assets" && (
        <FlexColumn
          className="assets-container"
          fullWidth
          fullHeight
          sx={{
            overflow: "hidden"
          }}
        >
          {!isMobile && (
            <PanelHeadline
              title={currentWorkflow ? "Workflow Output" : "Assets"}
              actions={
                <Tooltip
                  title="Open the global asset library"
                  placement="right-start"
                >
                  <ToolbarIconButton
                    className={`${path === "/assets" ? "active" : ""}`}
                    onClick={handleFullscreenClick}
                    tabIndex={-1}
                    icon={<Fullscreen />}
                  />
                </Tooltip>
              }
            />
          )}
          <AssetGridStoreProvider persistKey="asset-grid-storage:assets">
            <AssetGrid maxItemSize={5} isMobile={isMobile} />
          </AssetGridStoreProvider>
        </FlexColumn>
      )}
      {activeView === "library" && (
        <FlexColumn
          className="library-container"
          fullWidth
          fullHeight
          sx={{
            overflow: "hidden"
          }}
        >
          {!isMobile && (
            <PanelHeadline
              title="Library"
              actions={
                <Tooltip title="Open in full page" placement="right-start">
                  <ToolbarIconButton
                    className={`${path === "/assets" ? "active" : ""}`}
                    onClick={handleFullscreenClick}
                    tabIndex={-1}
                    icon={<Fullscreen />}
                  />
                </Tooltip>
              }
            />
          )}
          <AssetGridStoreProvider persistKey={LIBRARY_ASSET_GRID_STORE_KEY}>
            <AssetGrid maxItemSize={5} isMobile={isMobile} forceGlobalAssets />
          </AssetGridStoreProvider>
        </FlexColumn>
      )}
      {activeView === "workflows" && (
        <FlexColumn
          className="workflow-grid-container"
          fullWidth
          fullHeight
          sx={{
            overflow: "hidden"
          }}
        >
          {!isMobile && (
            <PanelHeadline
              title="Workflows"
              actions={<CreateWorkflowButton />}
            />
          )}
          <ScrollArea fullHeight>
            <WorkflowList />
          </ScrollArea>
        </FlexColumn>
      )}
      {activeView === "sketches" && (
        <FlexColumn
          className="sketch-list-container"
          fullWidth
          fullHeight
          sx={{
            overflow: "hidden"
          }}
        >
          {!isMobile && (
            <PanelHeadline
              title="Sketches"
              actions={<CreateSketchButton />}
            />
          )}
          <SketchListPanel />
        </FlexColumn>
      )}
      {activeView === "timelines" && (
        <FlexColumn
          className="timeline-list-container"
          fullWidth
          fullHeight
          sx={{
            overflow: "hidden"
          }}
        >
          {!isMobile && (
            <PanelHeadline
              title="Timelines"
              actions={<CreateTimelineButton />}
            />
          )}
          <TimelineListPanel />
        </FlexColumn>
      )}
      {activeView === "settings" && currentWorkflow && (
        <FlexColumn
          className="workflow-settings-container"
          fullWidth
          fullHeight
          sx={{
            overflow: "hidden"
          }}
        >
          {!isMobile && <PanelHeadline title="Settings" />}
          <ScrollArea fullHeight>
            <WorkflowForm workflow={currentWorkflow} onClose={closePanel} />
          </ScrollArea>
        </FlexColumn>
      )}
    </>
  );
});

// ---------------------------------------------------------------------------
// Mobile variant
// ---------------------------------------------------------------------------

const MOBILE_LAUNCHER_TOP = 48;
const MOBILE_LAUNCHER_TOP_STANDALONE = 8;

const mobileLauncherStyles = (theme: Theme, hasHeader: boolean) =>
  css({
    position: "fixed",
    top: `${hasHeader ? MOBILE_LAUNCHER_TOP : MOBILE_LAUNCHER_TOP_STANDALONE}px`,
    left: 8,
    zIndex: theme.zIndex.appBar,
    backgroundColor: theme.vars.palette.background.paper,
    color: theme.vars.palette.text.primary,
    border: `1px solid ${theme.vars.palette.divider}`,
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
    padding: getSpacingPx(SPACING.md),
    borderRadius: BORDER_RADIUS.lg,
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
      fontSize: "var(--fontSizeBig)"
    }
  });

const mobileHeaderExtrasStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexWrap: "wrap",
    gap: getSpacingPx(SPACING.xs),
    padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.lg)}`,
    overflowX: "auto",
    WebkitOverflowScrolling: "touch",
    "& .tab-button": {
      padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.lg)}`, // was 6px 10px
      borderRadius: BORDER_RADIUS.lg,
      color: theme.vars.palette.text.secondary,
      minWidth: "auto",
      "&.active": {
        backgroundColor: `${theme.vars.palette.action.selected}66`,
        color: theme.vars.palette.primary.main,
        boxShadow: `0 0 0 1px ${theme.vars.palette.primary.main}44 inset`
      },
      "& svg": {
        fontSize: "var(--fontSizeBig)"
      }
    }
  });

const MobilePanelLeft: React.FC<{
  activeView: LeftPanelView;
  activeNodeCategory: NodeCategoryId;
  setActiveNodeCategory: (id: NodeCategoryId) => void;
  isVisible: boolean;
  hasHeader: boolean;
  onOpen: () => void;
  onClose: () => void;
  onViewChange: (view: LeftPanelView) => void;
  handlePanelToggle: (view: LeftPanelView) => void;
}> = ({
  activeView,
  activeNodeCategory,
  setActiveNodeCategory,
  isVisible,
  hasHeader,
  onOpen,
  onClose,
  onViewChange,
  handlePanelToggle
}) => {
  const theme = useTheme();

  const handleSheetViewChange = useCallback(
    (view: LeftPanelView) => {
      onViewChange(view);
    },
    [onViewChange]
  );

  const launcherTitle =
    getTopLevelCategory(activeView)?.label ?? "Workflows";

  return (
    <>
      <ToolbarIconButton
        className={`panel-left-mobile-launcher ${isVisible ? "active" : ""}`}
        css={mobileLauncherStyles(theme, hasHeader)}
        onClick={isVisible ? onClose : onOpen}
        ariaLabel={isVisible ? "Close panel" : "Open left panel"}
        aria-expanded={isVisible}
        tabIndex={-1}
        icon={<MenuIcon />}
      />

      <MobileBottomSheet
        open={isVisible}
        onClose={onClose}
        title={launcherTitle}
        ariaLabel="Workflows, sketches, timelines, and assets panel"
        headerExtras={
          <div css={mobileHeaderExtrasStyles(theme)}>
            <Tooltip title="Workflows" placement="bottom" delay={TOOLTIP_ENTER_DELAY}>
              <ToolbarIconButton
                className={`tab-button ${activeView === "workflows" ? "active" : ""}`}
                onClick={() => handleSheetViewChange("workflows")}
                ariaLabel="Show workflows"
                tabIndex={-1}
                icon={<GridViewIcon />}
              />
            </Tooltip>
            <Tooltip title="Sketches" placement="bottom" delay={TOOLTIP_ENTER_DELAY}>
              <ToolbarIconButton
                className={`tab-button ${activeView === "sketches" ? "active" : ""}`}
                onClick={() => handleSheetViewChange("sketches")}
                ariaLabel="Show sketches"
                tabIndex={-1}
                icon={<IconForType iconName="image" showTooltip={false} iconSize="small" />}
              />
            </Tooltip>
            <Tooltip title="Timelines" placement="bottom" delay={TOOLTIP_ENTER_DELAY}>
              <ToolbarIconButton
                className={`tab-button ${activeView === "timelines" ? "active" : ""}`}
                onClick={() => handleSheetViewChange("timelines")}
                ariaLabel="Show timelines"
                tabIndex={-1}
                icon={<IconForType iconName="video" showTooltip={false} iconSize="small" />}
              />
            </Tooltip>
            <Tooltip title="Assets" placement="bottom" delay={TOOLTIP_ENTER_DELAY}>
              <ToolbarIconButton
                className={`tab-button ${activeView === "assets" ? "active" : ""}`}
                onClick={() => handleSheetViewChange("assets")}
                ariaLabel="Show assets"
                tabIndex={-1}
                icon={<IconForType iconName="asset" showTooltip={false} iconSize="small" />}
              />
            </Tooltip>
            <Tooltip title="Library" placement="bottom" delay={TOOLTIP_ENTER_DELAY}>
              <ToolbarIconButton
                className={`tab-button ${activeView === "library" ? "active" : ""}`}
                onClick={() => handleSheetViewChange("library")}
                ariaLabel="Show library"
                tabIndex={-1}
                icon={<CollectionsOutlinedIcon fontSize="small" />}
              />
            </Tooltip>

            <Box sx={{ flex: 1 }} />
            {activeView === "workflows" && <CreateWorkflowButton />}
            {activeView === "sketches" && <CreateSketchButton />}
            {activeView === "timelines" && <CreateTimelineButton />}
          </div>
        }
      >
        <FlexColumn
          sx={{
            height: "65vh",
            overflow: "hidden"
          }}
        >
          <ContextMenuProvider>
            <ContextMenus />
            <PanelContent
              activeView={activeView}
              activeNodeCategory={activeNodeCategory}
              setActiveNodeCategory={setActiveNodeCategory}
              handlePanelToggle={handlePanelToggle}
              isMobile
            />
          </ContextMenuProvider>
        </FlexColumn>
      </MobileBottomSheet>
    </>
  );
};

MobilePanelLeft.displayName = "MobilePanelLeft";

const PanelLeft: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const location = useLocation();
  const { activeTabType, activeTabMode } = useWorkspaceTabsStore(
    useShallow((state) => {
      const tab = state.tabs.find((t) => t.id === state.activeTabId);
      return {
        activeTabType: tab?.type ?? null,
        activeTabMode: tab?.mode ?? null
      };
    })
  );

  const isStandaloneMode =
    location.pathname.startsWith("/standalone-chat") ||
    location.pathname.startsWith("/miniapp");
  // The rail owns the app menu (logo) only in the unified workspace shell;
  // legacy routes still carry it in their own header.
  const isWorkspace = location.pathname.startsWith("/workspace");
  // On the global chat route the chat owns the screen and renders its own
  // conversation sidebar, so the rail's "Agent" entry is redundant. The chat
  // route also drops the header, so the rail runs full-height there.
  const isChatRoute = location.pathname.startsWith("/chat");
  const isWorkflowEditActive =
    location.pathname.startsWith("/editor/") ||
    (location.pathname.startsWith("/workspace") &&
      activeTabType === "workflow" &&
      activeTabMode === "edit");
  const hasHeader = !isStandaloneMode && !isChatRoute;

  const {
    ref: panelRef,
    size: panelSize,
    isVisible,
    isDragging,
    handleMouseDown,
    handlePanelToggle
  } = useResizePanel("left");

  const {
    activeView: rawActiveView,
    activeNodeCategory,
    setActiveNodeCategory,
    setVisibility,
    setActiveView
  } = usePanelStore(
    useShallow((state) => ({
      activeView: state.panel.activeView,
      activeNodeCategory: state.panel.activeNodeCategory,
      setActiveNodeCategory: state.setActiveNodeCategory,
      setVisibility: state.setVisibility,
      setActiveView: state.setActiveView
    }))
  );
  const activeView = rawActiveView || "workflows";

  const displayActiveView: LeftPanelView =
    isWorkflowEditOnlyView(activeView) && !isWorkflowEditActive
      ? "workflows"
      : (activeView as LeftPanelView);

  const hiddenViews = useMemo<readonly LeftPanelView[] | undefined>(() => {
    if (isChatRoute) {
      return CHAT_ROUTE_HIDDEN_VIEWS;
    }
    return isWorkflowEditActive ? undefined : WORKFLOW_EDIT_ONLY_VIEWS;
  }, [isChatRoute, isWorkflowEditActive]);

  const onViewChange = useCallback(
    (view: LeftPanelView) => {
      if (isWorkflowEditOnlyView(view) && !isWorkflowEditActive) {
        return;
      }
      handlePanelToggle(view);
    },
    [handlePanelToggle, isWorkflowEditActive]
  );

  const handlePanelToggleClick = useCallback(() => {
    handlePanelToggle(displayActiveView);
  }, [handlePanelToggle, displayActiveView]);

  const handleMobileOpen = useCallback(() => {
    handlePanelToggle(displayActiveView);
  }, [handlePanelToggle, displayActiveView]);

  const handleMobileClose = useCallback(() => {
    setVisibility(false);
  }, [setVisibility]);

  // Entering the chat route collapses the rail — the chat takes the full
  // screen there and provides its own conversation sidebar. Runs once per
  // route entry, so manually re-opening the panel afterwards is respected.
  useEffect(() => {
    if (isChatRoute) {
      setVisibility(false);
    }
  }, [isChatRoute, setVisibility]);

  useEffect(() => {
    if (!isWorkflowEditActive && isWorkflowEditOnlyView(activeView)) {
      setActiveView("workflows");
    }
  }, [activeView, isWorkflowEditActive, setActiveView]);

  if (isMobile && isChatRoute) {
    return null;
  }

  if (isMobile) {
    return (
      <MobilePanelLeft
        activeView={displayActiveView}
        activeNodeCategory={activeNodeCategory}
        setActiveNodeCategory={setActiveNodeCategory}
        isVisible={isVisible}
        hasHeader={hasHeader}
        onOpen={handleMobileOpen}
        onClose={handleMobileClose}
        onViewChange={onViewChange}
        handlePanelToggle={handlePanelToggle}
      />
    );
  }

  return (
    <div
      css={styles(theme, hasHeader, false)}
      className={`panel-left-container ${
        displayActiveView === "nodes" ? "is-nodes" : ""
      }`}
    >
      <ContextMenuProvider>
        <ContextMenus />
        <VerticalToolbar
          activeView={displayActiveView}
          onViewChange={onViewChange}
          handlePanelToggle={handlePanelToggleClick}
          showAppMenu={isWorkspace || isChatRoute}
          hiddenViews={hiddenViews}
        />

        {isVisible && (
          <div
            ref={panelRef}
            className={`drawer-content ${isDragging ? "dragging" : ""}`}
            role="region"
            aria-label="Left panel"
            style={{
              width: `${Math.max(
                panelSize - TOOLBAR_WIDTH,
                LEFT_PANEL_MIN_DRAWER_WIDTH
              )}px`,
              minWidth: `${LEFT_PANEL_MIN_DRAWER_WIDTH}px`
            }}
            onKeyDown={(e) => {
              if (
                e.key === "Escape" &&
                (displayActiveView === "nodes" ||
                  displayActiveView === "workflows" ||
                  displayActiveView === "sketches" ||
                  displayActiveView === "timelines")
              ) {
                e.stopPropagation();
                setVisibility(false);
              }
            }}
          >
            <div
              className="panel-resize-handle"
              onMouseDown={handleMouseDown}
              role="slider"
              aria-label="Resize panel"
              aria-valuenow={panelSize}
              aria-valuemin={60}
              aria-valuemax={800}
              tabIndex={-1}
            />
            <div className="panel-inner-content">
              <PanelContent
                activeView={displayActiveView}
                activeNodeCategory={activeNodeCategory}
                setActiveNodeCategory={setActiveNodeCategory}
                handlePanelToggle={handlePanelToggle}
              />
            </div>
          </div>
        )}
      </ContextMenuProvider>
    </div>
  );
};

PanelLeft.displayName = "PanelLeft";

export default memo(PanelLeft, isEqual);
