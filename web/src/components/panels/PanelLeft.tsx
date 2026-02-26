/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  IconButton,
  Tooltip,
  Box,
  Button,
  useMediaQuery,
  Divider
} from "@mui/material";
import { useResizePanel } from "../../hooks/handlers/useResizePanel";
import { useCombo } from "../../stores/KeyPressedStore";
import isEqual from "lodash/isEqual";
import { memo, useCallback } from "react";
import AssetGrid from "../assets/AssetGrid";
import WorkflowList from "../workflows/WorkflowList";

import { IconForType } from "../../config/data_types";
import { LeftPanelView, usePanelStore } from "../../stores/PanelStore";
import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import ContextMenus from "../context_menus/ContextMenus";
import { useLocation, useNavigate } from "react-router-dom";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import ThemeToggle from "../ui/ThemeToggle";
import PanelHeadline from "../ui/PanelHeadline";
// Icons
import CodeIcon from "@mui/icons-material/Code";
import GridViewIcon from "@mui/icons-material/GridView";
import DatasetIcon from "@mui/icons-material/Dataset";

import { Fullscreen } from "@mui/icons-material";
import { getShortcutTooltip } from "../../config/shortcuts";
// Models, Workspaces, and Collections (modals)
import ModelsManager from "../hugging_face/ModelsManager";
import WorkspacesManager from "../workspaces/WorkspacesManager";
import CollectionsManager from "../collections/CollectionsManager";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import { useModelManagerStore } from "../../stores/ModelManagerStore";
import { useWorkspaceManagerStore } from "../../stores/WorkspaceManagerStore";
import { useCollectionsManagerStore } from "../../stores/CollectionsManagerStore";
import { getIsElectronDetails } from "../../utils/browser";
import { isProduction } from "../../stores/ApiClient";

const TOOLBAR_WIDTH = 50;
const HEADER_HEIGHT = 77;
const HEADER_HEIGHT_MOBILE = 56;

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
      width: "6px",
      position: "absolute",
      right: 0,
      top: 0,
      height: "100%",
      backgroundColor: "transparent",
      border: 0,
      borderRadius: 0,
      cursor: "ew-resize",
      zIndex: 10,
      transition: "background-color 0.2s ease",

      "&:hover": {
        backgroundColor: theme.vars.palette.primary.main
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
        borderRadius: "8px",
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
            borderRadius: "8px"
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

  // Modal states for Collections, Models, and Workspaces
  const isCollectionsOpen = useCollectionsManagerStore((state) => state.isOpen);
  const setCollectionsOpen = useCollectionsManagerStore((state) => state.setIsOpen);
  const isModelsOpen = useModelManagerStore((state) => state.isOpen);
  const setModelsOpen = useModelManagerStore((state) => state.setIsOpen);
  const isWorkspacesOpen = useWorkspaceManagerStore((state) => state.isOpen);
  const setWorkspacesOpen = useWorkspaceManagerStore((state) => state.setIsOpen);

  // Conditional visibility for Models/Workspaces
  const showModelsWorkspaces = getIsElectronDetails().isElectron || !isProduction;

  const handleCollectionsClick = useCallback(() => {
    setCollectionsOpen(true);
  }, [setCollectionsOpen]);

  const handleCollectionsClose = useCallback(() => {
    setCollectionsOpen(false);
  }, [setCollectionsOpen]);

  const handleModelsClick = useCallback(() => {
    setModelsOpen(true);
  }, [setModelsOpen]);

  const handleModelsClose = useCallback(() => {
    setModelsOpen(false);
  }, [setModelsOpen]);

  const handleWorkspacesClick = useCallback(() => {
    setWorkspacesOpen(true);
  }, [setWorkspacesOpen]);

  const handleWorkspacesClose = useCallback(() => {
    setWorkspacesOpen(false);
  }, [setWorkspacesOpen]);

  const handlePanelToggleClick = useCallback(() => {
    handlePanelToggle();
  }, [handlePanelToggle]);

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
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <IconButton
          tabIndex={-1}
          onClick={() => onViewChange("workflowGrid")}
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
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <IconButton
          tabIndex={-1}
          onClick={() => onViewChange("assets")}
          className={activeView === "assets" && panelVisible ? "active" : ""}
        >
          <IconForType iconName="asset" showTooltip={false} iconSize="small" />
        </IconButton>
      </Tooltip>


      {/* Divider between drawer views and external actions */}
      <Divider sx={{ my: 1, mx: "6px", borderColor: "rgba(255, 255, 255, 0.15)" }} />

      {/* External section - modals */}
      <Tooltip
        title="Collections"
        placement="right-start"
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <IconButton
          tabIndex={-1}
          onClick={handleCollectionsClick}
        >
          <DatasetIcon />
        </IconButton>
      </Tooltip>

      {showModelsWorkspaces && (
        <>
          <Tooltip
            title="Model Manager"
            placement="right-start"
            enterDelay={TOOLTIP_ENTER_DELAY}
          >
            <IconButton
              tabIndex={-1}
              onClick={handleModelsClick}
            >
              <IconForType iconName="model" showTooltip={false} iconSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip
            title="Workspaces Manager"
            placement="right-start"
            enterDelay={TOOLTIP_ENTER_DELAY}
          >
            <IconButton
              tabIndex={-1}
              onClick={handleWorkspacesClick}
            >
              <FolderOpenIcon />
            </IconButton>
          </Tooltip>
        </>
      )}

      <div style={{ flexGrow: 1 }} />
      <ThemeToggle />
      <Tooltip title="Toggle Panel" placement="right-start">
        <IconButton tabIndex={-1} onClick={handlePanelToggleClick}>
          <CodeIcon />
        </IconButton>
      </Tooltip>

      {/* Modals for Collections, Models and Workspaces */}
      <CollectionsManager open={isCollectionsOpen} onClose={handleCollectionsClose} />
      {showModelsWorkspaces && (
        <>
          <ModelsManager open={isModelsOpen} onClose={handleModelsClose} />
          <WorkspacesManager open={isWorkspacesOpen} onClose={handleWorkspacesClose} />
        </>
      )}
    </div>
  );
});

const PanelContent = memo(function PanelContent({
  activeView,
  handlePanelToggle
}: {
  activeView: string;
  handlePanelToggle: (view: LeftPanelView) => void;
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
          sx={{ width: "100%", height: "100%", margin: "0 1em" }}
        >
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
          <AssetGrid maxItemSize={5} />
        </Box>
      )}
      {activeView === "workflowGrid" && (
        <Box
          className="workflow-grid-container"
          sx={{
            width: "100%",
            height: "100%",
            margin: "0 1em",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column"
          }}
        >
          <PanelHeadline title="Workflows" />
          <Box sx={{ flex: 1, overflow: "auto" }}>
            <WorkflowList />
          </Box>
        </Box>
      )}

    </>
  );
});

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

  const onViewChange = useCallback(
    (view: LeftPanelView) => {
      handlePanelToggle(view);
    },
    [handlePanelToggle]
  );



  return (
    <div css={styles(theme, hasHeader, isMobile)} className="panel-left-container">
      {/* Fixed toolbar - always on the left edge */}
      <ContextMenuProvider>
        <ContextMenus />
        <VerticalToolbar
          activeView={activeView}
          onViewChange={onViewChange}
          handlePanelToggle={() => handlePanelToggle(activeView)}
        />

        {/* Drawer content - appears right of toolbar when visible */}
        {isVisible && (
          <div
            ref={panelRef}
            className={`drawer-content ${isDragging ? "dragging" : ""}`}
            style={{
              width: `${isMobile
                ? Math.min(panelSize - TOOLBAR_WIDTH, Math.floor(window.innerWidth * 0.75) - TOOLBAR_WIDTH)
                : Math.max(panelSize - TOOLBAR_WIDTH, 250)
                }px`,
              minWidth: "250px",
              maxWidth: isMobile ? `calc(75vw - ${TOOLBAR_WIDTH}px)` : "none"
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

export default memo(PanelLeft, isEqual);
