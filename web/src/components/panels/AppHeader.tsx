/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useCallback, useMemo } from "react";
import { Tooltip, Toolbar, Box, IconButton } from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import RightSideButtons from "./RightSideButtons";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import EditIcon from "@mui/icons-material/Edit";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import Logo from "../Logo";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { IconForType } from "../../config/data_types";

const styles = (theme: Theme) =>
  css({
    "&": {
      width: "100%",
      overflow: "visible",
      backgroundColor: theme.vars.palette.c_app_header,
      backdropFilter: "blur(12px)",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      boxShadow: `0 4px 30px ${theme.vars.palette.grey[900]}1a`,
      paddingLeft: "8px",
      position: "fixed",
      top: 0,
      left: 0,
      zIndex: 1100
    },
    ".toolbar": {
      backgroundColor: "transparent",
      overflow: "visible",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      position: "relative",
      height: "40px",
      minHeight: "40px",
      padding: "0 2px 0 12px",
      border: "0"
    },
    ".MuiIconButton-root": {
      height: "28px",
      padding: "4px",
      color: theme.vars.palette.text.primary,
      borderRadius: "6px",
      fontSize: theme.typography.body2.fontSize,
      transition: "all 0.2s ease-out",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      },
      "& svg, & .icon-container svg": {
        display: "block",
        width: "18px",
        height: "18px",
        fontSize: "18px",
        marginRight: "4px"
      },
      "& .icon-container": {
        width: "18px",
        height: "18px",
        marginRight: "4px"
      }
    },
    ".navigate": {
      display: "flex !important",
      alignItems: "center",
      flex: "1 1 auto",
      gap: "8px"
    },
    // Mode pills - segmented control style
    ".mode-pills": {
      display: "flex",
      alignItems: "center",
      backgroundColor: "rgba(255, 255, 255, 0.06)",
      borderRadius: "20px",
      padding: "3px",
      gap: "2px",
      border: "1px solid rgba(255, 255, 255, 0.08)"
    },
    ".mode-pill": {
      padding: "5px 14px",
      borderRadius: "16px",
      fontWeight: 500,
      letterSpacing: "0.02em",
      color: theme.vars.palette.text.secondary,
      minWidth: "auto",
      textTransform: "uppercase",
      fontSize: theme.vars.fontSizeSmall,
      transition: "all 0.2s ease-out",
      border: "none",
      backgroundColor: "transparent",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: "6px",
      "& svg, & .icon-container svg": {
        width: "15px",
        height: "15px",
        fontSize: "15px"
      },
      "& .icon-container": {
        width: "15px",
        height: "15px"
      },
      "&:hover": {
        backgroundColor: "rgba(255, 255, 255, 0.08)",
        color: theme.vars.palette.text.primary
      },
      "&.active": {
        backgroundColor: "rgba(255, 255, 255, 0.12)",
        color: theme.vars.palette.text.primary,
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.15)",
        "& svg, & .icon-container svg": {
          color: theme.vars.palette.text.primary
        }
      }
    },
    // Standalone nav button (Templates)
    ".nav-button": {
      padding: "4px 12px",
      borderRadius: "6px",
      fontWeight: 500,
      letterSpacing: "0.02em",
      color: theme.vars.palette.text.secondary,
      minWidth: "auto",
      transition: "all 0.2s ease-out",
      border: "1px solid transparent",
      "& svg": {
        marginRight: "6px",
        transition: "color 0.2s ease"
      },
      "& .icon-container": {
        marginRight: "6px"
      },
      position: "relative",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        color: theme.vars.palette.text.primary,
        "& svg": {
          color: theme.vars.palette.text.primary
        }
      },
      "&.active": {
        backgroundColor: "rgba(var(--palette-primary-main-channel) / 0.1)",
        border: `1px solid rgba(var(--palette-primary-main-channel) / 0.2)`,
        color: theme.vars.palette.primary.main,
        "& svg, & .icon-container svg": {
          color: theme.vars.palette.primary.main
        }
      }
    },
    ".nav-button-text": {
      display: "inline",
      fontSize: theme.vars.fontSizeSmall,
      textTransform: "uppercase",
      fontWeight: 300
    },
    ".logo-container": {
      display: "flex",
      alignItems: "center",
      marginRight: "16px",
      cursor: "pointer"
    },
    ".buttons-right": {
      display: "flex",
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "center",
      background: "transparent",
      flexShrink: 0,
      marginRight: "4px",
      gap: "4px"
    }
    // Mobile styles handled via separate CSS file
  });

// Mode pills component - segmented control for Editor, Chat, Dashboard
const ModePills = memo(function ModePills({ currentPath }: { currentPath: string }) {
  const navigate = useNavigate();
  const currentWorkflowId = useWorkflowManager((state) => state.currentWorkflowId);
  const createNewWorkflow = useWorkflowManager((state) => state.createNew);
  const lastUsedThreadId = useGlobalChatStore((state) => state.lastUsedThreadId);
  const createNewThread = useGlobalChatStore((state) => state.createNewThread);
  const switchThread = useGlobalChatStore((state) => state.switchThread);

  // Determine active mode - only modes are active, not other routes
  const isEditorActive = currentPath.startsWith("/editor");
  const isChatActive = currentPath.startsWith("/chat");
  const isAppActive = currentPath.startsWith("/apps");

  const handleEditorClick = useCallback(async () => {
    if (currentWorkflowId) {
      navigate(`/editor/${currentWorkflowId}`);
    } else {
      try {
        const workflow = await createNewWorkflow();
        navigate(`/editor/${workflow.id}`);
      } catch (error) {
        console.error("Failed to create new workflow:", error);
      }
    }
  }, [navigate, currentWorkflowId, createNewWorkflow]);

  const handleChatClick = useCallback(async () => {
    try {
      if (lastUsedThreadId) {
        switchThread(lastUsedThreadId);
        navigate(`/chat/${lastUsedThreadId}`);
      } else {
        const newThreadId = await createNewThread();
        switchThread(newThreadId);
        navigate(`/chat/${newThreadId}`);
      }
    } catch {
      navigate(`/chat`);
    }
  }, [lastUsedThreadId, navigate, createNewThread, switchThread]);

  const handleAppClick = useCallback(() => {
    if (currentWorkflowId) {
      navigate(`/apps/${currentWorkflowId}`);
    }
  }, [navigate, currentWorkflowId]);

  return (
    <div className="mode-pills">
      <Tooltip title="Editor" enterDelay={TOOLTIP_ENTER_DELAY} placement="bottom">
        <button
          className={`mode-pill ${isEditorActive ? "active" : ""}`}
          onClick={handleEditorClick}
          tabIndex={-1}
          aria-current={isEditorActive ? "page" : undefined}
        >
          <EditIcon />
          <span>Editor</span>
        </button>
      </Tooltip>
      <Tooltip title="Chat" enterDelay={TOOLTIP_ENTER_DELAY} placement="bottom">
        <button
          className={`mode-pill ${isChatActive ? "active" : ""}`}
          onClick={handleChatClick}
          tabIndex={-1}
          aria-current={isChatActive ? "page" : undefined}
        >
          <IconForType iconName="message" showTooltip={false} />
          <span>Chat</span>
        </button>
      </Tooltip>
      <Tooltip title={currentWorkflowId ? "Run as App" : "Open a workflow first"} enterDelay={TOOLTIP_ENTER_DELAY} placement="bottom">
        <button
          className={`mode-pill ${isAppActive ? "active" : ""}`}
          onClick={handleAppClick}
          tabIndex={-1}
          aria-current={isAppActive ? "page" : undefined}
          disabled={!currentWorkflowId}
          style={{ opacity: currentWorkflowId ? 1 : 0.5 }}
        >
          <RocketLaunchIcon />
          <span>App</span>
        </button>
      </Tooltip>
    </div>
  );
});

// Templates button - positioned closer to right utility icons
const TemplatesButton = memo(function TemplatesButton({
  isActive
}: {
  isActive: boolean;
}) {
  const navigate = useNavigate();

  const handleClick = useCallback(() => {
    navigate("/templates");
  }, [navigate]);

  return (
    <Tooltip
      title="Explore Templates"
      enterDelay={TOOLTIP_ENTER_DELAY}
      placement="bottom"
    >
      <IconButton
        className={`nav-button templates-button ${isActive ? "active" : ""}`}
        onClick={handleClick}
        tabIndex={-1}
        aria-current={isActive ? "page" : undefined}
      >
        <ViewModuleIcon />
        <span className="nav-button-text">Templates</span>
      </IconButton>
    </Tooltip>
  );
});

const AppHeader: React.FC = memo(function AppHeader() {
  const theme = useTheme();
  const path = useLocation().pathname;
  const headerStyles = useMemo(() => styles(theme), [theme]);
  const navigate = useNavigate();

  const handleLogoClick = useCallback(() => {
    navigate("/dashboard");
  }, [navigate]);

  return (
    <div css={headerStyles} className="app-header">
      <Toolbar variant="dense" className="toolbar" tabIndex={-1}>
        <div className="navigate" style={{ WebkitAppRegion: "no-drag" } as any}>
          {/* Logo - clicks to Dashboard */}
          <Tooltip title="Go to Dashboard" enterDelay={TOOLTIP_ENTER_DELAY} placement="bottom">
            <div className="logo-container" onClick={handleLogoClick}>
              <Logo
                small
                width="20px"
                height="20px"
                fontSize="1em"
                borderRadius="4px"
              />
            </div>
          </Tooltip>
          {/* Mode Pills - Editor, Chat, Dashboard */}
          <ModePills currentPath={path} />
          <Box sx={{ flexGrow: 1 }} />
        </div>
        <div
          className="buttons-right"
          style={{ WebkitAppRegion: "no-drag" } as any}
        >
          {/* Templates button - closer to right utility icons */}
          <TemplatesButton isActive={path.startsWith("/templates")} />
          <RightSideButtons />
        </div>
      </Toolbar>
    </div>
  );
});

AppHeader.displayName = "AppHeader";

export default AppHeader;
