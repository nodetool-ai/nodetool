/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  useMediaQuery
} from "@mui/material";
import { ToolbarIconButton, FlexColumn, Box } from "../ui_primitives";
import { useResizePanel } from "../../hooks/handlers/useResizePanel";
import { useAuditCuratedCategories } from "../../hooks/useAuditCuratedCategories";
import isEqual from "fast-deep-equal";
import { memo, useCallback } from "react";
import AssetGrid from "../assets/AssetGrid";
import WorkflowList from "../workflows/WorkflowList";
import WorkflowForm from "../workflows/WorkflowForm";
import CreateWorkflowButton from "../workflows/CreateWorkflowButton";
import AgentPanel from "./AgentPanel";
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
  getTopLevelCategory
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
      gap: "8px",
      backgroundColor: theme.vars.palette.background.default,
      borderRight: `1px solid ${theme.vars.palette.divider}`,
      paddingTop: "10px",
      paddingBottom: "10px",

      "& .toolbar-divider": {
        height: "1px",
        margin: "8px 10px",
        backgroundColor: theme.vars.palette.divider
      },

      "& .MuiIconButton-root, .MuiButton-root": {
        padding: "8px",
        margin: "0 6px",
        borderRadius: "8px",
        backgroundColor: "transparent",
        transition:
          "background-color 140ms ease-out, color 140ms ease-out",

        "& svg": {
          fontSize: "1.125rem",
          color: theme.vars.palette.text.secondary,
          transition: "color 140ms ease-out"
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
    }
  });
};

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
      <FlexColumn
        fullWidth
        fullHeight
        sx={{
          overflow: "hidden",
          margin: isMobile ? "0" : "0 0.5em"
        }}
      >
        {!isMobile && <PanelHeadline title="Nodes" />}
        <QuickAccessGrid
          activeSubcategory={activeNodeCategory}
          onSubcategoryChange={setActiveNodeCategory}
        />
      </FlexColumn>
    );
  }

  return (
    <>
      {activeView === "history" && (
        <FlexColumn
          fullWidth
          fullHeight
          sx={{
            margin: isMobile ? "0" : "0 0.5em",
            overflow: "hidden"
          }}
        >
          {!isMobile && <PanelHeadline title="History" />}
          <HistoryTilesPanel />
        </FlexColumn>
      )}
      {activeView === "favorites" && (
        <Box
          sx={{
            width: "100%",
            height: "100%",
            
            overflow: "hidden",
            display: "flex",
            flexDirection: "column"
          }}
        >
          {!isMobile && <PanelHeadline title="Favorites" />}
          <ScrollArea fullHeight>
            <FavoritesTiles showEmpty hideHeader />
          </ScrollArea>
        </Box>
      )}
      {activeView === "assets" && (
        <Box
          className="assets-container"
          sx={{
            width: "100%",
            height: "100%",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column"
          }}
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
        <FlexColumn
          className="workflow-grid-container"
          fullWidth
          fullHeight
          sx={{
            margin: isMobile ? "0" : "0 1em",
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
      {activeView === "settings" && currentWorkflow && (
        <Box
          className="workflow-settings-container"
          sx={{
            width: "100%",
            height: "100%",
            overflow: "auto"
          }}
        >
          {!isMobile && <PanelHeadline title="Settings" />}
          <WorkflowForm workflow={currentWorkflow} onClose={closePanel} />
        </Box>
      )}
      {activeView === "agent" && (
        <FlexColumn
          className="agent-panel-container"
          fullWidth
          fullHeight
          sx={{
            overflow: "hidden"
          }}
        >
          {!isMobile && <PanelHeadline title="Agent" />}
          <AgentPanel />
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
            {activeView === "workflows" && <CreateWorkflowButton />}
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
            role="region"
            aria-label="Left panel"
            style={{
              width: `${Math.max(panelSize - TOOLBAR_WIDTH, 250)}px`,
              minWidth: "250px"
            }}
            onKeyDown={(e) => {
              if (
                e.key === "Escape" &&
                (activeView === "nodes" || activeView === "workflows")
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
