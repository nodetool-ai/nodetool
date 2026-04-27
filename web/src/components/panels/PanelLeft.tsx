/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  IconButton,
  Box,
  Button,
  useMediaQuery
} from "@mui/material";
import { useResizePanel } from "../../hooks/handlers/useResizePanel";
import { useCombo } from "../../stores/KeyPressedStore";
import isEqual from "fast-deep-equal";
import { memo, useCallback } from "react";
import AssetGrid from "../assets/AssetGrid";
import WorkflowList from "../workflows/WorkflowList";

import { IconForType } from "../../config/data_types";
import { LeftPanelView, usePanelStore } from "../../stores/PanelStore";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import ContextMenus from "../context_menus/ContextMenus";
import { useLocation, useNavigate } from "react-router-dom";
import { TOOLTIP_ENTER_DELAY, TOOLBAR_WIDTH, PANEL_RESIZE_HANDLE_WIDTH } from "../../config/constants";
import ThemeToggle from "../ui/ThemeToggle";
import PanelHeadline from "../ui/PanelHeadline";
import { ScrollArea, Tooltip, MobileBottomSheet } from "../ui_primitives";
import MenuIcon from "@mui/icons-material/Menu";
// Icons
import CodeIcon from "@mui/icons-material/Code";
import GridViewIcon from "@mui/icons-material/GridView";

import { Fullscreen } from "@mui/icons-material";
import { getShortcutTooltip } from "../../config/shortcuts";
// Models, Workspaces, and Collections (modals)

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
    // Main container - fixed to left edge of viewport
    position: "fixed",
    left: 0,
    top: `${headerHeight}px`,
    height: `calc(100vh - ${headerHeight}px)`,
    display: "flex",
    flexDirection: "row",
    zIndex: 1100,

    // Drawer content area (appears right of toolbar)
    ".drawer-content": {
      height: "100%",
      backgroundColor: theme.vars.palette.background.default,
      borderRight: `1px solid ${theme.vars.palette.divider}`,
      boxShadow: "4px 0 8px rgba(0, 0, 0, 0.05)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    },

    // Resize handle on right edge of drawer
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

    // Fixed toolbar on the left edge
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
        // Match IconForType "small" size (20px)
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

    // Inner content wrapper
    ".panel-inner-content": {
      display: "flex",
      flex: 1,
      height: "100%",
      overflow: "hidden"
    },

    ".help-chat": {
      "& .MuiButton-root": {
        whiteSpace: "normal",
        wordWrap: "break-word",
        textTransform: "none",
        maxWidth: "160px",
        borderColor: theme.vars.palette.grey[400],
        color: theme.vars.palette.grey[700],
        margin: "0.5em",
        padding: "0.5em 1em",

        "[data-mui-color-scheme='dark'] &": {
          borderColor: theme.vars.palette.grey[200],
          color: theme.vars.palette.grey[200]
        },

        "&:hover": {
          borderColor: "var(--palette-primary-main)",
          color: "var(--palette-primary-main)"
        }
      }
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

  const handlePanelToggleClick = useCallback(() => {
    handlePanelToggle();
  }, [handlePanelToggle]);

  const handleWorkflowViewClick = useCallback(() => {
    onViewChange("workflowGrid");
  }, [onViewChange]);

  const handleAssetsViewClick = useCallback(() => {
    onViewChange("assets");
  }, [onViewChange]);

  return (
    <div className="vertical-toolbar">
      {/* Drawer views section - My Stuff */}
      <Tooltip
        title={
          <div className="tooltip-span">
            <div className="tooltip-title">Workflows</div>
            <div className="tooltip-key">
              <kbd>1</kbd>
            </div>
          </div>
        }
        placement="right-start"
        delay={TOOLTIP_ENTER_DELAY}
      >
        <IconButton
          tabIndex={-1}
          aria-label="Show workflows"
          onClick={handleWorkflowViewClick}
          className={
            activeView === "workflowGrid" && panelVisible ? "active" : ""
          }
        >
          <GridViewIcon />
        </IconButton>
      </Tooltip>
      <Tooltip
        title={getShortcutTooltip("toggleAssets")}
        placement="right-start"
        delay={TOOLTIP_ENTER_DELAY}
      >
        <IconButton
          tabIndex={-1}
          aria-label="Show assets"
          onClick={handleAssetsViewClick}
          className={activeView === "assets" && panelVisible ? "active" : ""}
        >
          <IconForType iconName="asset" showTooltip={false} iconSize="small" />
        </IconButton>
      </Tooltip>


      <div style={{ flexGrow: 1 }} />
      <ThemeToggle />
      <Tooltip title="Toggle Panel" placement="right-start">
        <IconButton tabIndex={-1} aria-label="Toggle panel" onClick={handlePanelToggleClick}>
          <CodeIcon />
        </IconButton>
      </Tooltip>
    </div>
  );
});

const PanelContent = memo(function PanelContent({
  activeView,
  handlePanelToggle,
  isMobile = false
}: {
  activeView: string;
  handlePanelToggle: (view: LeftPanelView) => void;
  isMobile?: boolean;
}) {
  const navigate = useNavigate();
  const path = useLocation().pathname;

  const handleFullscreenClick = useCallback(() => {
    navigate("/assets");
    handlePanelToggle("assets");
  }, [navigate, handlePanelToggle]);

  return (
    <>
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
                  <Button
                    className={`${path === "/assets" ? "active" : ""}`}
                    onClick={handleFullscreenClick}
                    tabIndex={-1}
                    size="small"
                  >
                    <Fullscreen />
                  </Button>
                </Tooltip>
              }
            />
          )}
          <AssetGrid maxItemSize={5} isMobile={isMobile} />
        </Box>
      )}
      {activeView === "workflowGrid" && (
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

    </>
  );
});

// ---------------------------------------------------------------------------
// Mobile variant — the left panel becomes a launcher FAB + bottom sheet.
// ---------------------------------------------------------------------------

const MOBILE_LAUNCHER_TOP = 48; // sits just below the 40px AppHeader
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
  isVisible: boolean;
  hasHeader: boolean;
  onOpen: () => void;
  onClose: () => void;
  onViewChange: (view: LeftPanelView) => void;
  handlePanelToggle: (view: LeftPanelView) => void;
}> = ({
  activeView,
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
        // On mobile we never want tapping a tab to close the sheet — just switch
        // the active view. Fall back to the toggle helper only when the sheet is
        // currently closed (so the caller can open it via the FAB).
        onViewChange(view);
      },
      [onViewChange]
    );

    const launcherTitle =
      activeView === "assets" ? "Assets" : "Workflows";

    return (
      <>
        <IconButton
          className={`panel-left-mobile-launcher ${isVisible ? "active" : ""}`}
          css={mobileLauncherStyles(theme, hasHeader)}
          onClick={isVisible ? onClose : onOpen}
          aria-label={isVisible ? "Close panel" : "Open workflows panel"}
          aria-expanded={isVisible}
          tabIndex={-1}
        >
          <MenuIcon />
        </IconButton>

        <MobileBottomSheet
          open={isVisible}
          onClose={onClose}
          title={launcherTitle}
          ariaLabel="Workflows and assets panel"
          headerExtras={
            <div css={mobileHeaderExtrasStyles(theme)}>
              <Tooltip title="Workflows" placement="bottom" delay={TOOLTIP_ENTER_DELAY}>
                <IconButton
                  className={`tab-button ${activeView === "workflowGrid" ? "active" : ""}`}
                  onClick={() => handleSheetViewChange("workflowGrid")}
                  aria-label="Show workflows"
                  tabIndex={-1}
                >
                  <GridViewIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Assets" placement="bottom" delay={TOOLTIP_ENTER_DELAY}>
                <IconButton
                  className={`tab-button ${activeView === "assets" ? "active" : ""}`}
                  onClick={() => handleSheetViewChange("assets")}
                  aria-label="Show assets"
                  tabIndex={-1}
                >
                  <IconForType
                    iconName="asset"
                    showTooltip={false}
                    iconSize="small"
                  />
                </IconButton>
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

  // Detect routes that don't have AppHeader (standalone modes)
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

  useCombo(["1"], () => handlePanelToggle("workflowGrid"), false);
  useCombo(["2"], () => handlePanelToggle("assets"), false);


  const activeView =
    usePanelStore((state) => state.panel.activeView) || "workflowGrid";
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
    // Ensure the sheet always opens to the current activeView (setting it if
    // collapsed).
    handlePanelToggle(activeView);
  }, [handlePanelToggle, activeView]);

  const handleMobileClose = useCallback(() => {
    setVisibility(false);
  }, [setVisibility]);

  // On mobile chat routes, hide the left panel — chat has its own conversations UI
  const isChatRoute = location.pathname.startsWith("/chat");
  if (isMobile && isChatRoute) {
    return null;
  }

  if (isMobile) {
    return (
      <MobilePanelLeft
        activeView={activeView as LeftPanelView}
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
      {/* Fixed toolbar - always on the left edge */}
      <ContextMenuProvider>
        <ContextMenus />
        <VerticalToolbar
          activeView={activeView}
          onViewChange={onViewChange}
          handlePanelToggle={handlePanelToggleClick}
        />

        {/* Drawer content - appears right of toolbar when visible */}
        {isVisible && (
          <div
            ref={panelRef}
            className={`drawer-content ${isDragging ? "dragging" : ""}`}
            style={{
              width: `${Math.max(panelSize - TOOLBAR_WIDTH, 250)}px`,
              minWidth: "250px"
            }}
          >
            {/* Resize handle on right edge */}
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
