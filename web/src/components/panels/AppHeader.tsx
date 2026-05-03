/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useCallback, useMemo } from "react";
import { Toolbar, Box, useMediaQuery } from "@mui/material";
import { EditorButton } from "../editor_ui";
import AutoAwesomeMosaicIcon from "@mui/icons-material/AutoAwesomeMosaic";
import { useLocation, useNavigate } from "react-router-dom";
import { TOOLTIP_ENTER_DELAY, HEADER_HEIGHT } from "../../config/constants";
import RightSideButtons from "./RightSideButtons";
import Logo from "../Logo";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { FlexRow, Tooltip } from "../ui_primitives";
import WorkspaceSelect from "../workspaces/WorkspaceSelect";
import { useCurrentWorkspace } from "../../hooks/useCurrentWorkspace";
import { isProduction } from "../../lib/env";

const workspacesEnabled = !isProduction;

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
      position: "relative",
      height: `${HEADER_HEIGHT}px`,
      minHeight: `${HEADER_HEIGHT}px`,
      padding: "0 2px 0 12px",
      border: "0"
    },
    ".MuiIconButton-root": {
      height: "28px",
      padding: "4px",
      color: theme.vars.palette.text.primary,
      borderRadius: "var(--rounded-md)",
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
      flex: "1 1 auto",
      WebkitAppRegion: "no-drag"
    },
    // Mode pills - segmented control style
    ".mode-pills": {
      display: "flex",
      alignItems: "center",
      gap: "2px",
      border: "1px solid var(--palette-grey-800)",
      borderRadius: "var(--rounded-md)",
      height: "1.6em",
    },
    ".mode-pill": {
      padding: "5px 14px",
      borderRadius: "var(--rounded-sm)",
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
        height: "15px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      },
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        color: theme.vars.palette.text.primary
      },
      "&.active": {
        backgroundColor: theme.vars.palette.action.selected,
        color: theme.vars.palette.text.primary,
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.15)",
        "& svg, & .icon-container svg": {
          color: theme.vars.palette.text.primary
        }
      }
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
      marginLeft: "1em",
      marginRight: "4px",
      gap: "4px",
      WebkitAppRegion: "no-drag"
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
      // Thread creation failed, navigate to chat without thread
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
      <Tooltip title="Editor" delay={TOOLTIP_ENTER_DELAY} placement="bottom">
        <button
          className={`mode-pill ${isEditorActive ? "active" : ""}`}
          onClick={handleEditorClick}
          tabIndex={-1}
          aria-current={isEditorActive ? "page" : undefined}
        >
          <span>Editor</span>
        </button>
      </Tooltip>
      <Tooltip title="Chat" delay={TOOLTIP_ENTER_DELAY} placement="bottom">
        <button
          className={`mode-pill ${isChatActive ? "active" : ""}`}
          onClick={handleChatClick}
          tabIndex={-1}
          aria-current={isChatActive ? "page" : undefined}
        >
          <span>Chat</span>
        </button>
      </Tooltip>
      <Tooltip title={currentWorkflowId ? "Run as App" : "Open a workflow first"} delay={TOOLTIP_ENTER_DELAY} placement="bottom">
        <span style={{ display: "inline-flex" }}>
          <button
            className={`mode-pill ${isAppActive ? "active" : ""}`}
            onClick={handleAppClick}
            tabIndex={-1}
            aria-current={isAppActive ? "page" : undefined}
            disabled={!currentWorkflowId}
            style={{
              opacity: currentWorkflowId ? 1 : 0.4,
              cursor: currentWorkflowId ? "pointer" : "default"
            }}
          >
            <span>App</span>
          </button>
        </span>
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
      delay={TOOLTIP_ENTER_DELAY}
      placement="bottom"
    >
      <EditorButton
        variant="outlined"
        size="small"
        sx={{
          height: "1.75em",
          minWidth: "auto",
          borderRadius: "var(--rounded-md)",
          color: "var(--palette-text-default)",
          border: "1px solid transparent",
          gap: "6px",
          "& .templates-icon": {
            width: "16px",
            height: "16px",
            fontSize: "16px"
          },
          "&:hover": {
            backgroundColor: "var(--palette-action-hover)",
            color: "var(--palette-text-primary)",
            borderColor: "transparent",
          },
          "&.active": {

            color: "var(--palette-primary-contrastText)",
            backgroundColor: "var(--palette-primary-main)",
            borderColor: "var(--palette-primary-main)",
          }
        }}
        className={`nav-button templates-button ${isActive ? "active" : ""}`}
        onClick={handleClick}
        tabIndex={-1}
        aria-current={isActive ? "page" : undefined}
        aria-label="Templates"
      >
        <AutoAwesomeMosaicIcon className="templates-icon" />
        <span className="nav-button-text">Templates</span>
      </EditorButton>
    </Tooltip>
  );
});

const HeaderWorkspaceSelector = memo(function HeaderWorkspaceSelector() {
  const { workspaceId, setWorkspaceId } = useCurrentWorkspace();
  return (
    <Tooltip
      title="Current workspace"
      delay={TOOLTIP_ENTER_DELAY}
      placement="bottom"
    >
      <Box sx={{ width: 200 }}>
        <WorkspaceSelect
          value={workspaceId}
          onChange={setWorkspaceId}
          compact
        />
      </Box>
    </Tooltip>
  );
});

const AppHeader: React.FC = memo(function AppHeader() {
  const theme = useTheme();
  const path = useLocation().pathname;
  const headerStyles = useMemo(() => styles(theme), [theme]);
  const navigate = useNavigate();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const handleLogoClick = useCallback(() => {
    navigate("/dashboard");
  }, [navigate]);

  return (
    <div css={headerStyles} className="app-header">
      <Toolbar variant="dense" className="toolbar" tabIndex={-1} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <FlexRow className="navigate" gap={1} align="center">
          {/* Logo - clicks to Dashboard */}
          <Tooltip title="Go to Dashboard" delay={TOOLTIP_ENTER_DELAY} placement="bottom">
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
        </FlexRow>
        <div className="buttons-right">
          {workspacesEnabled && !isMobile && <HeaderWorkspaceSelector />}
          <TemplatesButton isActive={path.startsWith("/templates")} />
          <RightSideButtons />
        </div>
      </Toolbar>
    </div>
  );
});

AppHeader.displayName = "AppHeader";

export default AppHeader;
