/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useCallback, useMemo } from "react";
import { Tooltip, Toolbar, Box, IconButton } from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import RightSideButtons from "./RightSideButtons";
import DashboardIcon from "@mui/icons-material/Dashboard";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import EditIcon from "@mui/icons-material/Edit";
import DatasetIcon from "@mui/icons-material/Dataset";
import DescriptionIcon from "@mui/icons-material/Description";
import Logo from "../Logo";
import useGlobalChatStore from "../../stores/GlobalChatStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import ModelsButton from "../hugging_face/ModelsButton";
import { IconForType } from "../../config/data_types";
import { useAppHeaderStore } from "../../stores/AppHeaderStore";

const styles = (theme: Theme) =>
  css({
    "&": {
      width: "100%",
      overflow: "visible",
      backgroundColor: theme.vars.palette.c_app_header,
      backdropFilter: "blur(12px)",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      boxShadow: "0 4px 30px rgba(0, 0, 0, 0.1)",
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
    ".nav-group": {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "2px 4px",
      borderRadius: "10px"
    },
    ".nav-button": {
      padding: "4px 12px",
      borderRadius: "20px",
      fontWeight: 600,
      letterSpacing: "0.02em",
      color: theme.vars.palette.text.secondary,
      minWidth: "auto",
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      border: "1px solid transparent",
      "& svg": {
        marginRight: "6px",
        transition: "color 0.3s ease"
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
        boxShadow: "0 0 15px rgba(var(--palette-primary-main-channel) / 0.15)",
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
      marginRight: "16px"
    },
    ".buttons-right": {
      display: "flex",
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "center",
      background: "transparent",
      flexShrink: 0,
      marginRight: "4px"
    }
    // Mobile styles handled via separate CSS file
  });

// Logo is now part of the header on all devices

const DashboardButton = memo(function DashboardButton({
  isActive
}: {
  isActive: boolean;
}) {
  const navigate = useNavigate();
  const theme = useTheme();
  const handleClick = useCallback(() => {
    navigate("/dashboard");
  }, [navigate]);

  return (
    <Tooltip
      title="Go to Dashboard"
      enterDelay={TOOLTIP_ENTER_DELAY}
      placement="bottom"
    >
      <IconButton
        className={`nav-button dashboard-button ${isActive ? "active" : ""}`}
        onClick={handleClick}
        tabIndex={-1}
        aria-current={isActive ? "page" : undefined}
      >
        <DashboardIcon />
        <span className="nav-button-text">Dashboard</span>
      </IconButton>
    </Tooltip>
  );
});

const TemplatesButton = memo(function TemplatesButton({
  isActive
}: {
  isActive: boolean;
}) {
  const navigate = useNavigate();
  const theme = useTheme();

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

const ChatButton = memo(function ChatButton({
  isActive
}: {
  isActive: boolean;
}) {
  const navigate = useNavigate();
  const theme = useTheme();
  const { lastUsedThreadId, createNewThread, switchThread } =
    useGlobalChatStore();

  const handleClick = useCallback(async () => {
    try {
      if (lastUsedThreadId) {
        switchThread(lastUsedThreadId);
        navigate(`/chat/${lastUsedThreadId}`);
      } else {
        const newThreadId = await createNewThread();
        switchThread(newThreadId);
        navigate(`/chat/${newThreadId}`);
      }
    } catch (e) {
      navigate(`/chat`);
    }
  }, [lastUsedThreadId, navigate, createNewThread, switchThread]);

  return (
    <Tooltip
      title="Open Chat"
      enterDelay={TOOLTIP_ENTER_DELAY}
      placement="bottom"
    >
      <IconButton
        className={`nav-button chat-button ${isActive ? "active" : ""}`}
        onClick={handleClick}
        tabIndex={-1}
        aria-current={isActive ? "page" : undefined}
      >
        <IconForType iconName="message" showTooltip={false} />
        <span className="nav-button-text">Chat</span>
      </IconButton>
    </Tooltip>
  );
});

const EditorButton = memo(function EditorButton({
  isActive
}: {
  isActive: boolean;
}) {
  const navigate = useNavigate();
  const currentWorkflowId = useWorkflowManager(
    (state) => state.currentWorkflowId
  );
  const createNewWorkflow = useWorkflowManager((state) => state.createNew);

  const handleClick = useCallback(async () => {
    if (currentWorkflowId) {
      navigate(`/editor/${currentWorkflowId}`);
    } else {
      // Create a new workflow if none exists
      const workflow = await createNewWorkflow();
      navigate(`/editor/${workflow.id}`);
    }
  }, [navigate, currentWorkflowId, createNewWorkflow]);

  return (
    <Tooltip
      title={currentWorkflowId ? "Open Editor" : "Create New Workflow"}
      enterDelay={TOOLTIP_ENTER_DELAY}
      placement="bottom"
    >
      <IconButton
        className={`nav-button editor-button ${isActive ? "active" : ""}`}
        onClick={handleClick}
        tabIndex={-1}
        aria-current={isActive ? "page" : undefined}
      >
        <EditIcon />
        <span className="nav-button-text">Editor</span>
      </IconButton>
    </Tooltip>
  );
});

const AssetsButton = memo(function AssetsButton({
  isActive
}: {
  isActive: boolean;
}) {
  const navigate = useNavigate();
  const theme = useTheme();

  const handleClick = useCallback(() => {
    navigate("/assets");
  }, [navigate]);

  return (
    <Tooltip title="Assets" enterDelay={TOOLTIP_ENTER_DELAY} placement="bottom">
      <IconButton
        className={`nav-button assets-button ${isActive ? "active" : ""}`}
        onClick={handleClick}
        tabIndex={-1}
        aria-current={isActive ? "page" : undefined}
      >
        <IconForType iconName="asset" showTooltip={false} />
        <span className="nav-button-text">Assets</span>
      </IconButton>
    </Tooltip>
  );
});

const CollectionsButton = memo(function CollectionsButton({
  isActive
}: {
  isActive: boolean;
}) {
  const navigate = useNavigate();
  const theme = useTheme();

  const handleClick = useCallback(() => {
    navigate("/collections");
  }, [navigate]);

  return (
    <Tooltip
      title="Collections"
      enterDelay={TOOLTIP_ENTER_DELAY}
      placement="bottom"
    >
      <IconButton
        className={`nav-button collections-button ${isActive ? "active" : ""}`}
        onClick={handleClick}
        tabIndex={-1}
        aria-current={isActive ? "page" : undefined}
      >
        <DatasetIcon />
        <span className="nav-button-text">Collections</span>
      </IconButton>
    </Tooltip>
  );
});

const DocsButton = memo(function DocsButton() {
  const handleClick = useCallback(() => {
    window.open("https://docs.nodetool.ai", "_blank");
  }, []);

  return (
    <Tooltip
      title="Documentation"
      enterDelay={TOOLTIP_ENTER_DELAY}
      placement="bottom"
    >
      <IconButton
        className="nav-button docs-button"
        onClick={handleClick}
        tabIndex={-1}
      >
        <DescriptionIcon />
        <span className="nav-button-text">Docs</span>
      </IconButton>
    </Tooltip>
  );
});

const AppHeader: React.FC = memo(function AppHeader() {
  const theme = useTheme();
  const path = useLocation().pathname;
  const headerStyles = useMemo(() => styles(theme), [theme]);
  const { handleOpenHelp } = useAppHeaderStore();

  return (
    <div css={headerStyles} className="app-header">
      <Toolbar variant="dense" className="toolbar" tabIndex={-1}>
        <div className="navigate" style={{ WebkitAppRegion: "no-drag" } as any}>
          <div className="logo-container">
            <Logo
              small
              width="20px"
              height="20px"
              fontSize="1em"
              borderRadius="4px"
              onClick={handleOpenHelp}
            />
          </div>
          <div className="nav-group">
            <EditorButton isActive={path.startsWith("/editor")} />
            <ChatButton isActive={path.startsWith("/chat")} />
            <AssetsButton isActive={path.startsWith("/assets")} />
            <ModelsButton />
            <TemplatesButton isActive={path.startsWith("/templates")} />
            <CollectionsButton isActive={path.startsWith("/collections")} />
            <DashboardButton isActive={path.startsWith("/dashboard")} />
            <DocsButton />
          </div>
          <Box sx={{ flexGrow: 0.02 }} />
        </div>
        <div
          className="buttons-right"
          style={{ WebkitAppRegion: "no-drag" } as any}
        >
          <RightSideButtons />
        </div>
      </Toolbar>
    </div>
  );
});

AppHeader.displayName = "AppHeader";

export default AppHeader;
