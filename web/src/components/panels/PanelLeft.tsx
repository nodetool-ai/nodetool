/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Box,
  useMediaQuery
} from "@mui/material";
import { ToolbarIconButton } from "../ui_primitives";
import { useResizePanel } from "../../hooks/handlers/useResizePanel";
import { useCombo } from "../../stores/KeyPressedStore";
import { useAuditCuratedCategories } from "../../hooks/useAuditCuratedCategories";
import isEqual from "fast-deep-equal";
import { memo, useCallback } from "react";
import AssetGrid from "../assets/AssetGrid";
import WorkflowList from "../workflows/WorkflowList";
import WorkflowForm from "../workflows/WorkflowForm";
import AgentPanel from "./AgentPanel";
import SidebarSearchPanel from "../node_menu/SidebarSearchPanel";
import HistoryTilesPanel from "../node_menu/HistoryTilesPanel";
import FavoritesTiles from "../node_menu/FavoritesTiles";
import QuickAccessSidebar from "../node_menu/QuickAccessSidebar";
import QuickAccessGrid from "../node_menu/QuickAccessGrid";

import { IconForType } from "../../config/data_types";
import {
  LeftPanelView,
  NodeCategoryId,
  usePanelStore
} from "../../stores/PanelStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import {
  LEFT_PANEL_TOP_LEVEL,
  NODE_SUBCATEGORIES,
  getTopLevelCategory,
  getNodeSubcategory
} from "../../config/quickAccessCategories";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import ContextMenus from "../context_menus/ContextMenus";
import { useLocation, useNavigate } from "react-router-dom";
import { TOOLTIP_ENTER_DELAY, TOOLBAR_WIDTH, PANEL_RESIZE_HANDLE_WIDTH } from "../../config/constants";
import ThemeToggle from "../ui/ThemeToggle";
import PanelHeadline from "../ui/PanelHeadline";
import { ScrollArea, Tooltip, MobileBottomSheet } from "../ui_primitives";
import MenuIcon from "@mui/icons-material/Menu";
import CodeIcon from "@mui/icons-material/Code";
import GridViewIcon from "@mui/icons-material/GridView";

import { Fullscreen } from "@mui/icons-material";

const HEADER_HEIGHT = 77;
const HEADER_HEIGHT_MOBILE = 40;

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
    top: `${headerHeight}px`,
    height: `calc(100vh - ${headerHeight}px)`,
    display: "flex",
    flexDirection: "row",
    zIndex: 1100,

    ".drawer-content": {
      height: "100%",
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
      gap: 6,
      backgroundColor: theme.vars.palette.background.default,
      borderRight: `1px solid ${theme.vars.palette.divider}`,
      paddingTop: "8px",

      "& .MuiIconButton-root, .MuiButton-root": {
        padding: "10px",
        borderRadius: "var(--rounded-lg)",
        position: "relative",
        transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
        willChange: "transform, box-shadow",
        backgroundColor: "transparent",
        "& svg": {
          fontSize: "1.25rem",
          "[data-mui-color-scheme='dark'] &": {
            color: theme.vars.palette.grey[100]
          }
        },

        "&.active": {
          backgroundColor: `${theme.vars.palette.action.selected}66`,
          boxShadow: `0 0 0 1px ${theme.vars.palette.primary.main}44 inset`
        },
        "&.active svg": {
          color: theme.vars.palette.primary.main
        },
        "&:hover": {
          backgroundColor: `${theme.vars.palette.action.hover}66`,
          boxShadow: `0 4px 18px ${theme.vars.palette.action.hover}30`,
          transform: "scale(1.02)",
          "&::after": {
            content: '""',
            position: "absolute",
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            background: `linear-gradient(135deg, ${theme.vars.palette.primary.main}20, transparent)`,
            borderRadius: "var(--rounded-lg)"
          },
          "& svg, & .icon-container svg": {
            transform: "scale(1.05)",
            filter: `drop-shadow(0 0 6px ${theme.vars.palette.primary.main}33)`
          }
        },
        "&:active": {
          transform: "scale(0.98)",
          boxShadow: `0 2px 10px ${theme.vars.palette.action.hover}24`
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
};

const nodeSubTabsStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexWrap: "wrap",
    gap: "4px",
    padding: "6px 8px 8px",
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    "& .node-sub-tab": {
      padding: "4px 10px",
      borderRadius: "var(--rounded-md)",
      color: theme.vars.palette.text.secondary,
      backgroundColor: "transparent",
      fontSize: "0.78rem",
      lineHeight: 1.2,
      letterSpacing: "0.01em",
      textTransform: "none",
      minWidth: "auto",
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      cursor: "pointer",
      border: "none",
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
  });


const VerticalToolbar = memo(function VerticalToolbar({
  activeView,
  onViewChange,
  handlePanelToggle
}: {
  activeView: string;
  onViewChange: (view: LeftPanelView) => void;
  handlePanelToggle: () => void;
}) {
  const panelVisible = usePanelStore((state) => state.panel.isVisible);

  // Sidebar shows the view as "active" only when the panel is open and
  // that view is selected.
  const renderedActive: LeftPanelView | "" =
    panelVisible && LEFT_PANEL_TOP_LEVEL.some((c) => c.id === activeView)
      ? (activeView as LeftPanelView)
      : "";

  return (
    <div className="vertical-toolbar">
      <QuickAccessSidebar
        activeCategory={renderedActive}
        onCategoryClick={onViewChange}
      />
      <div style={{ flexGrow: 1 }} />
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

const NodesSubTabs = memo(function NodesSubTabs({
  activeSubcategory,
  onSubcategoryChange
}: {
  activeSubcategory: NodeCategoryId;
  onSubcategoryChange: (id: NodeCategoryId) => void;
}) {
  const theme = useTheme();
  return (
    <div css={nodeSubTabsStyles(theme)} role="tablist" aria-label="Node categories">
      {NODE_SUBCATEGORIES.map((sub) => (
        <button
          key={sub.id}
          role="tab"
          aria-selected={activeSubcategory === sub.id}
          className={`node-sub-tab ${activeSubcategory === sub.id ? "active" : ""}`}
          onClick={() => onSubcategoryChange(sub.id)}
          type="button"
        >
          {sub.icon}
          <span>{sub.label}</span>
        </button>
      ))}
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
    const sub = getNodeSubcategory(activeNodeCategory) ?? NODE_SUBCATEGORIES[0];
    return (
      <Box
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          margin: isMobile ? "0" : "0 0.5em"
        }}
      >
        {!isMobile && <PanelHeadline title="Nodes" />}
        <NodesSubTabs
          activeSubcategory={sub.id}
          onSubcategoryChange={setActiveNodeCategory}
        />
        <QuickAccessGrid category={sub} />
      </Box>
    );
  }

  return (
    <>
      {activeView === "search" && (
        <Box
          sx={{
            width: "100%",
            height: "100%",
            margin: isMobile ? "0" : "0 0.5em",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column"
          }}
        >
          {!isMobile && <PanelHeadline title="Search nodes" />}
          <SidebarSearchPanel />
        </Box>
      )}
      {activeView === "history" && (
        <Box
          sx={{
            width: "100%",
            height: "100%",
            margin: isMobile ? "0" : "0 0.5em",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column"
          }}
        >
          {!isMobile && <PanelHeadline title="History" />}
          <HistoryTilesPanel />
        </Box>
      )}
      {activeView === "favorites" && (
        <Box
          sx={{
            width: "100%",
            height: "100%",
            margin: isMobile ? "0" : "0 0.5em",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column"
          }}
        >
          {!isMobile && <PanelHeadline title="Favorites" />}
          <ScrollArea fullHeight>
            <FavoritesTiles showEmpty />
          </ScrollArea>
        </Box>
      )}
      {activeView === "assets" && (
        <Box
          className="assets-container"
          sx={{ width: "100%", height: "100%", margin: isMobile ? "0" : "0 1em" }}
        >
          {!isMobile && (
            <PanelHeadline
              title="Assets"
              actions={
                <Tooltip title="Fullscreen" placement="right-start">
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
          <AssetGrid maxItemSize={5} isMobile={isMobile} />
        </Box>
      )}
      {activeView === "workflows" && (
        <Box
          className="workflow-grid-container"
          sx={{
            width: "100%",
            height: "100%",
            margin: isMobile ? "0" : "0 1em",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column"
          }}
        >
          {!isMobile && <PanelHeadline title="Workflows" />}
          <ScrollArea fullHeight>
            <WorkflowList />
          </ScrollArea>
        </Box>
      )}
      {activeView === "settings" && currentWorkflow && (
        <Box
          className="workflow-settings-container"
          sx={{
            width: "100%",
            height: "100%",
            overflow: "auto"
          }}
        >
          <WorkflowForm workflow={currentWorkflow} onClose={closePanel} />
        </Box>
      )}
      {activeView === "agent" && (
        <Box
          className="agent-panel-container"
          sx={{
            width: "100%",
            height: "100%",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column"
          }}
        >
          <AgentPanel />
        </Box>
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

const mobileHeaderExtrasStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexWrap: "wrap",
    gap: "4px",
    padding: "8px 12px",
    overflowX: "auto",
    WebkitOverflowScrolling: "touch",
    "& .tab-button": {
      padding: "6px 10px",
      borderRadius: "var(--rounded-lg)",
      color: theme.vars.palette.text.secondary,
      minWidth: "auto",
      "&.active": {
        backgroundColor: `${theme.vars.palette.action.selected}66`,
        color: theme.vars.palette.primary.main,
        boxShadow: `0 0 0 1px ${theme.vars.palette.primary.main}44 inset`
      },
      "& svg": {
        fontSize: "1.1rem"
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
        ariaLabel={isVisible ? "Close panel" : "Open workflows panel"}
        aria-expanded={isVisible}
        tabIndex={-1}
        icon={<MenuIcon />}
      />

      <MobileBottomSheet
        open={isVisible}
        onClose={onClose}
        title={launcherTitle}
        ariaLabel="Workflows and assets panel"
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
            <Tooltip title="Assets" placement="bottom" delay={TOOLTIP_ENTER_DELAY}>
              <ToolbarIconButton
                className={`tab-button ${activeView === "assets" ? "active" : ""}`}
                onClick={() => handleSheetViewChange("assets")}
                ariaLabel="Show assets"
                tabIndex={-1}
                icon={<IconForType iconName="asset" showTooltip={false} iconSize="small" />}
              />
            </Tooltip>

            <Box sx={{ flex: 1 }} />
          </div>
        }
      >
        <Box
          sx={{
            height: "65vh",
            display: "flex",
            flexDirection: "column",
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
        </Box>
      </MobileBottomSheet>
    </>
  );
};

MobilePanelLeft.displayName = "MobilePanelLeft";

const PanelLeft: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const location = useLocation();

  const isStandaloneMode =
    location.pathname.startsWith("/standalone-chat") ||
    location.pathname.startsWith("/miniapp");
  const hasHeader = !isStandaloneMode;

  const {
    ref: panelRef,
    size: panelSize,
    isVisible,
    isDragging,
    handleMouseDown,
    handlePanelToggle
  } = useResizePanel("left");

  useCombo(["1"], () => handlePanelToggle("workflows"), false);
  useCombo(["2"], () => handlePanelToggle("assets"), false);
  useAuditCuratedCategories();

  const activeView =
    usePanelStore((state) => state.panel.activeView) || "workflows";
  const activeNodeCategory = usePanelStore(
    (state) => state.panel.activeNodeCategory
  );
  const setActiveNodeCategory = usePanelStore(
    (state) => state.setActiveNodeCategory
  );
  const setVisibility = usePanelStore((state) => state.setVisibility);

  const onViewChange = useCallback(
    (view: LeftPanelView) => {
      handlePanelToggle(view);
    },
    [handlePanelToggle]
  );

  const handlePanelToggleClick = useCallback(() => {
    handlePanelToggle(activeView);
  }, [handlePanelToggle, activeView]);

  const handleMobileOpen = useCallback(() => {
    handlePanelToggle(activeView);
  }, [handlePanelToggle, activeView]);

  const handleMobileClose = useCallback(() => {
    setVisibility(false);
  }, [setVisibility]);

  const isChatRoute = location.pathname.startsWith("/chat");
  if (isMobile && isChatRoute) {
    return null;
  }

  if (isMobile) {
    return (
      <MobilePanelLeft
        activeView={activeView as LeftPanelView}
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
    <div css={styles(theme, hasHeader, false)} className="panel-left-container">
      <ContextMenuProvider>
        <ContextMenus />
        <VerticalToolbar
          activeView={activeView}
          onViewChange={onViewChange}
          handlePanelToggle={handlePanelToggleClick}
        />

        {isVisible && (
          <div
            ref={panelRef}
            className={`drawer-content ${isDragging ? "dragging" : ""}`}
            style={{
              width: `${Math.max(panelSize - TOOLBAR_WIDTH, 250)}px`,
              minWidth: "250px"
            }}
          >
            <div
              className="panel-resize-handle"
              onMouseDown={handleMouseDown}
              role="slider"
              aria-label="Resize panel"
              tabIndex={-1}
            />
            <div className="panel-inner-content">
              <PanelContent
                activeView={activeView}
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
