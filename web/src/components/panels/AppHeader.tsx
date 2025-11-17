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
      backgroundColor: theme.vars.palette.grey[900],
      paddingLeft: "8px",
      position: "fixed",
      top: 0,
      left: 0,
      zIndex: 1100
    },
    ".toolbar": {
      backgroundColor: theme.vars.palette.grey[900],
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
      color: theme.vars.palette.grey[0],
      borderRadius: "6px",
      fontSize: theme.typography.body2.fontSize,
      transition: "all 0.2s ease-out",
      "&:hover": {
        backgroundColor: "rgba(255, 255, 255, 0.05)"
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
      padding: "0px 8px",
      borderRadius: "8px",
      fontWeight: 600,
      letterSpacing: "0.01em",
      color: theme.vars.palette.grey[100],
      minWidth: "auto",
      "& svg": {
        marginRight: "6px"
      },
      "& .icon-container": {
        marginRight: "6px"
      },
      position: "relative",
      "&.active": {
        border: `1px solid ${theme.vars.palette.primary.main}`,
        borderRadius: 0,
        color: theme.vars.palette.primary.main,
        "& svg, & .icon-container svg": {
          color: theme.vars.palette.primary.main
        }
      }
      // "&.active::after": {
      //   content: '""',
      //   position: "absolute",
      //   left: "10%",
      //   right: "10%",
      //   bottom: "-6px",
      //   height: "2px",
      //   borderRadius: "2px",
      //   background: theme.vars.palette.primary.main,
      //   opacity: 0.85
      // }
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
  const theme = useTheme();
  const currentWorkflowId = useWorkflowManager(
    (state) => state.currentWorkflowId
  );

  const handleClick = useCallback(() => {
    if (currentWorkflowId) {
      navigate(`/editor/${currentWorkflowId}`);
    } else {
      navigate("/editor");
    }
  }, [navigate, currentWorkflowId]);

  return (
    <Tooltip
      title="Open Editor"
      enterDelay={TOOLTIP_ENTER_DELAY}
      placement="bottom"
    >
      <IconButton
        className={`nav-button editor-button ${isActive ? "active" : ""}`}
        onClick={handleClick}
        tabIndex={-1}
        aria-current={isActive ? "page" : undefined}
        disabled={!currentWorkflowId}
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
