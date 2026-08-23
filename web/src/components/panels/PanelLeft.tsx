/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useMediaQuery } from "@mui/material";
import {
  BORDER_RADIUS,
  Box,
  Divider,
  FlexColumn,
  FlexRow,
  MOTION,
  MobileBottomSheet,
  SPACING,
  ScrollArea,
  ToolbarIconButton,
  Tooltip,
  Z_INDEX,
  getSpacingPx,
  thinScrollbarStyles
} from "../ui_primitives";
import { useResizePanel } from "../../hooks/handlers/useResizePanel";
import isEqual from "../../utils/isEqual";
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
import TimelineListPanel, {
  CreateTimelineButton
} from "../timeline/TimelineListPanel";
import SketchListPanel, { CreateSketchButton } from "../sketch/SketchListPanel";
import StoryboardListPanel, {
  CreateStoryboardButton
} from "../storyboard/StoryboardListPanel";
import ScriptListPanel, { CreateScriptButton } from "../script/ScriptListPanel";
import JsScriptListPanel, {
  CreateJsScriptButton
} from "../jsScript/JsScriptListPanel";
import ChatListPanel, { CreateChatButton } from "../chat/ChatListPanel";
import ApplicationListPanel, {
  CreateApplicationButton,
  CreateApplicationFromWorkflowButton
} from "../applications/ApplicationListPanel";
import HistoryTilesPanel from "../node_menu/HistoryTilesPanel";
import FavoritesTiles from "../node_menu/FavoritesTiles";
import QuickAccessSidebar from "../node_menu/QuickAccessSidebar";
import NodeLibrary from "../node_menu/NodeLibrary";
import RailAppMenu from "./RailAppMenu";

import {
  LeftPanelView,
  NodeCategoryId,
  usePanelStore
} from "../../stores/PanelStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { PAGE_TAB_TITLES } from "../workspace/pageTabs";
import {
  LEFT_PANEL_TOP_LEVEL,
  LEFT_PANEL_GROUPS,
  WORKFLOW_OUTPUT_DESCRIPTION,
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
import MenuIcon from "@mui/icons-material/Menu";
import CodeIcon from "@mui/icons-material/Code";

import Fullscreen from "@mui/icons-material/Fullscreen";

const HEADER_HEIGHT = 77;
const HEADER_HEIGHT_MOBILE = 40;

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
        flexShrink: 0
      },

      "& .quick-access-top": {
        flex: 1,
        minHeight: 0,
        overflowX: "hidden",
        overflowY: "auto",
        ...thinScrollbarStyles(theme)
      },

      "& .quick-access-bottom, & .quick-access-group": {
        flexShrink: 0
      },

      "& .MuiIconButton-root, .MuiButton-root": {
        padding: `${theme.spacing(1)}`,
        margin: `0 ${theme.spacing(SPACING.xs)}`,
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
  activeView: LeftPanelView;
  onViewChange: (view: LeftPanelView) => void;
  handlePanelToggle: () => void;
  showAppMenu?: boolean;
  hiddenViews?: readonly LeftPanelView[];
}) {
  const panelVisible = usePanelStore((state) => state.panel.isVisible);
  const currentWorkflow = useWorkflowManager((state) =>
    state.currentWorkflowId
      ? (state.nodeStores[state.currentWorkflowId]?.getState().getWorkflow() ??
        null)
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
        <RailAppMenu />
      )}
      <QuickAccessSidebar
        activeCategory={renderedActive}
        onCategoryClick={onViewChange}
        hiddenViews={hiddenViews}
        labelOverrides={labelOverrides}
      />
      <Divider className="toolbar-divider" sx={{ mx: SPACING.lg }} />
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
  activeView: LeftPanelView;
  activeNodeCategory: NodeCategoryId;
  setActiveNodeCategory: (id: NodeCategoryId) => void;
  handlePanelToggle: (view: LeftPanelView) => void;
  isMobile?: boolean;
}) {
  const navigate = useNavigate();
  const path = useLocation().pathname;
  const currentWorkflow = useWorkflowManager((state) =>
    state.currentWorkflowId
      ? (state.nodeStores[state.currentWorkflowId]?.getState().getWorkflow() ??
        null)
      : null
  );
  const setVisibility = usePanelStore((state) => state.setVisibility);
  const closePanel = useCallback(() => setVisibility(false), [setVisibility]);
  const activeCategory = getTopLevelCategory(activeView);
  const headlineDescription =
    activeView === "assets" && currentWorkflow
      ? WORKFLOW_OUTPUT_DESCRIPTION
      : activeCategory.description;

  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  // The asset library is a workspace tab like the other manager pages, not a
  // route of its own.
  const handleFullscreenClick = useCallback(() => {
    openTab({
      type: "page",
      ref: "assets",
      mode: "view",
      title: PAGE_TAB_TITLES.assets
    });
    navigate("/workspace");
    handlePanelToggle("assets");
  }, [openTab, navigate, handlePanelToggle]);

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
          {!isMobile && (
            <PanelHeadline
              title="Recent Nodes"
              docsTopic={activeCategory.docsTopic}
              description={headlineDescription}
            />
          )}
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
          {!isMobile && (
            <PanelHeadline
              title="Favorite Nodes"
              docsTopic={activeCategory.docsTopic}
              description={headlineDescription}
            />
          )}
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
              docsTopic={activeCategory.docsTopic}
              description={headlineDescription}
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
                    ariaLabel="Open the global asset library"
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
              docsTopic={activeCategory.docsTopic}
              description={headlineDescription}
              actions={
                <Tooltip title="Open in full page" placement="right-start">
                  <ToolbarIconButton
                    className={`${path === "/assets" ? "active" : ""}`}
                    onClick={handleFullscreenClick}
                    tabIndex={-1}
                    icon={<Fullscreen />}
                    ariaLabel="Open library in full page"
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
              docsTopic={activeCategory.docsTopic}
              description={headlineDescription}
              actions={<CreateWorkflowButton />}
            />
          )}
          <ScrollArea fullHeight>
            <WorkflowList />
          </ScrollArea>
        </FlexColumn>
      )}
      {activeView === "chats" && (
        <FlexColumn
          className="chat-list-container"
          fullWidth
          fullHeight
          sx={{
            overflow: "hidden"
          }}
        >
          {!isMobile && (
            <PanelHeadline
              title="Chats"
              docsTopic={activeCategory.docsTopic}
              description={headlineDescription}
              actions={<CreateChatButton />}
            />
          )}
          <ChatListPanel />
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
              docsTopic={activeCategory.docsTopic}
              description={headlineDescription}
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
              docsTopic={activeCategory.docsTopic}
              description={headlineDescription}
              actions={<CreateTimelineButton />}
            />
          )}
          <TimelineListPanel />
        </FlexColumn>
      )}
      {activeView === "storyboards" && (
        <FlexColumn
          className="storyboard-list-container"
          fullWidth
          fullHeight
          sx={{
            overflow: "hidden"
          }}
        >
          {!isMobile && (
            <PanelHeadline
              title="Storyboards"
              docsTopic={activeCategory.docsTopic}
              description={headlineDescription}
              actions={<CreateStoryboardButton />}
            />
          )}
          <StoryboardListPanel />
        </FlexColumn>
      )}
      {activeView === "scripts" && (
        <FlexColumn
          className="script-list-container"
          fullWidth
          fullHeight
          sx={{
            overflow: "hidden"
          }}
        >
          {!isMobile && (
            <PanelHeadline
              title="Scripts"
              docsTopic={activeCategory.docsTopic}
              description={headlineDescription}
              actions={<CreateScriptButton />}
            />
          )}
          <ScriptListPanel />
        </FlexColumn>
      )}
      {activeView === "jsscripts" && (
        <FlexColumn
          className="jsscript-list-container"
          fullWidth
          fullHeight
          sx={{
            overflow: "hidden"
          }}
        >
          {!isMobile && (
            <PanelHeadline
              title="JS Scripts"
              docsTopic={activeCategory.docsTopic}
              description={headlineDescription}
              actions={<CreateJsScriptButton />}
            />
          )}
          <JsScriptListPanel />
        </FlexColumn>
      )}
      {activeView === "apps" && (
        <FlexColumn
          className="application-list-container"
          fullWidth
          fullHeight
          sx={{
            overflow: "hidden"
          }}
        >
          {!isMobile && (
            <PanelHeadline
              title="Apps"
              docsTopic={activeCategory.docsTopic}
              description={headlineDescription}
              actions={
                <>
                  <CreateApplicationFromWorkflowButton />
                  <CreateApplicationButton />
                </>
              }
            />
          )}
          <ApplicationListPanel />
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
          {!isMobile && (
            <PanelHeadline
              title="Workflow Settings"
              docsTopic={activeCategory.docsTopic}
              description={headlineDescription}
            />
          )}
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

// Clears the mobile tab bar (48px) plus an 8px gap.
const MOBILE_LAUNCHER_TOP = 56;
const MOBILE_LAUNCHER_TOP_STANDALONE = 8;

// Chrome shared by every button in the floating mobile launcher cluster.
const mobileLauncherChrome = (theme: Theme) => ({
  backgroundColor: theme.vars.palette.background.paper,
  color: theme.vars.palette.text.primary,
  border: `1px solid ${theme.vars.palette.divider}`,
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
  padding: getSpacingPx(SPACING.md),
  borderRadius: BORDER_RADIUS.lg,
  "&:hover": {
    backgroundColor: theme.vars.palette.action.hover
  },
  "& svg": {
    fontSize: "var(--fontSizeBig)"
  }
});

// The floating panel toggle in the top-left corner, used on the mobile routes
// that have no top row of their own. In the workspace shell the toggle sits in
// the tab bar instead (MobileRailLauncher).
const mobileLauncherBarStyles = (theme: Theme, hasHeader: boolean) =>
  css({
    position: "fixed",
    top: `${hasHeader ? MOBILE_LAUNCHER_TOP : MOBILE_LAUNCHER_TOP_STANDALONE}px`,
    left: 8,
    zIndex: theme.zIndex.appBar,
    display: "flex",
    alignItems: "center",
    gap: getSpacingPx(SPACING.xs)
  });

const mobileLauncherStyles = (theme: Theme) =>
  css({
    ...mobileLauncherChrome(theme),
    "&.active": {
      backgroundColor: theme.vars.palette.primary.main,
      color: theme.vars.palette.primary.contrastText,
      "&:hover": {
        backgroundColor: theme.vars.palette.primary.dark
      }
    }
  });

const mobileHeaderExtrasStyles = (theme: Theme) =>
  css({
    display: "flex",
    // Every top-level view gets a tab, so the row scrolls sideways rather than
    // wrapping into several rows of icons above the sheet content.
    flexWrap: "nowrap",
    gap: getSpacingPx(SPACING.xs),
    padding: `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.lg)}`,
    overflowX: "auto",
    WebkitOverflowScrolling: "touch",
    "& .mobile-tab-group": {
      flexShrink: 0
    },
    "& .mobile-tab-group + .mobile-tab-group": {
      marginLeft: getSpacingPx(SPACING.xs),
      paddingLeft: getSpacingPx(SPACING.md),
      borderLeft: `1px solid ${theme.vars.palette.divider}`
    },
    "& .tab-button": {
      flexShrink: 0,
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

// The create action each list view offers, mirroring the desktop panel
// headlines (which mobile hides in favour of the sheet header).
const MOBILE_CREATE_ACTIONS: Partial<Record<LeftPanelView, React.FC>> = {
  workflows: CreateWorkflowButton,
  chats: CreateChatButton,
  sketches: CreateSketchButton,
  timelines: CreateTimelineButton,
  storyboards: CreateStoryboardButton,
  scripts: CreateScriptButton,
  jsscripts: CreateJsScriptButton,
  apps: CreateApplicationButton
};

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
  /** Top-level views to omit, same as the desktop rail. */
  hiddenViews?: readonly LeftPanelView[];
  /**
   * In the workspace shell the top row carries the launcher buttons
   * (MobileRailLauncher), so this variant renders only the sheet.
   */
  hideLauncher?: boolean;
}> = ({
  activeView,
  activeNodeCategory,
  setActiveNodeCategory,
  isVisible,
  hasHeader,
  onOpen,
  onClose,
  onViewChange,
  handlePanelToggle,
  hiddenViews,
  hideLauncher = false
}) => {
  const theme = useTheme();

  const handleSheetViewChange = useCallback(
    (view: LeftPanelView) => {
      onViewChange(view);
    },
    [onViewChange]
  );

  const categoryGroups = useMemo(
    () =>
      LEFT_PANEL_GROUPS.map((group) => ({
        ...group,
        categories: group.categories.filter(
          (category) => !hiddenViews?.includes(category.id)
        )
      })).filter((group) => group.categories.length > 0),
    [hiddenViews]
  );

  const CreateAction = MOBILE_CREATE_ACTIONS[activeView];

  const launcherTitle = getTopLevelCategory(activeView).label;

  return (
    <>
      {!hideLauncher && (
        <div css={mobileLauncherBarStyles(theme, hasHeader)}>
          <ToolbarIconButton
            className={`panel-left-mobile-launcher ${isVisible ? "active" : ""}`}
            css={mobileLauncherStyles(theme)}
            onClick={isVisible ? onClose : onOpen}
            ariaLabel={isVisible ? "Close panel" : "Open left panel"}
            aria-expanded={isVisible}
            tabIndex={-1}
            icon={<MenuIcon />}
          />
        </div>
      )}

      <MobileBottomSheet
        open={isVisible}
        onClose={onClose}
        title={launcherTitle}
        ariaLabel="Workflows, sketches, timelines, and assets panel"
        headerExtras={
          <div css={mobileHeaderExtrasStyles(theme)}>
            {categoryGroups.map((group) => (
              <FlexRow
                key={group.id}
                className="mobile-tab-group"
                gap={SPACING.xs}
              >
                {group.categories.map((category) => (
                  <Tooltip
                    key={category.id}
                    title={category.label}
                    placement="bottom"
                    delay={TOOLTIP_ENTER_DELAY}
                  >
                    <ToolbarIconButton
                      className={`tab-button ${
                        activeView === category.id ? "active" : ""
                      }`}
                      onClick={() => handleSheetViewChange(category.id)}
                      ariaLabel={category.label}
                      tabIndex={-1}
                      icon={category.icon}
                    />
                  </Tooltip>
                ))}
              </FlexRow>
            ))}

            <Box sx={{ flex: 1 }} />
            {CreateAction && <CreateAction />}
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

  const isStandaloneMode = location.pathname.startsWith("/standalone-chat");
  // The rail owns the app menu (logo) only in the unified workspace shell;
  // legacy routes still carry it in their own header.
  const isWorkspace = location.pathname.startsWith("/workspace");
  const isWorkflowEditActive =
    location.pathname.startsWith("/editor/") ||
    (location.pathname.startsWith("/workspace") &&
      activeTabType === "workflow" &&
      activeTabMode === "edit");
  const hasHeader = !isStandaloneMode;
  const panelLeftStyles = useMemo(
    () => styles(theme, hasHeader, false),
    [theme, hasHeader]
  );

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
      : activeView;

  const hiddenViews = useMemo<readonly LeftPanelView[] | undefined>(
    () => (isWorkflowEditActive ? undefined : WORKFLOW_EDIT_ONLY_VIEWS),
    [isWorkflowEditActive]
  );

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

  useEffect(() => {
    if (!isWorkflowEditActive && isWorkflowEditOnlyView(activeView)) {
      setActiveView("workflows");
    }
  }, [activeView, isWorkflowEditActive, setActiveView]);

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
        hiddenViews={hiddenViews}
        hideLauncher={isWorkspace}
      />
    );
  }

  return (
    <div
      css={panelLeftStyles}
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
          showAppMenu={isWorkspace}
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
                  displayActiveView === "chats" ||
                  displayActiveView === "sketches" ||
                  displayActiveView === "timelines" ||
                  displayActiveView === "storyboards" ||
                  displayActiveView === "scripts" ||
                  displayActiveView === "jsscripts")
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
