/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback } from "react";

// components
import Alert from "../node_editor/Alert";
import Logo from "../Logo";
// mui
import {
  Button,
  Tooltip,
  Toolbar,
  Typography,
  Box,
  IconButton
} from "@mui/material";

// hooks and stores
import { useLocation, useNavigate } from "react-router-dom";

// constants
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import RightSideButtons from "./RightSideButtons";
import DashboardIcon from "@mui/icons-material/Dashboard";
import ChatIcon from "@mui/icons-material/Chat";

const styles = (theme: any) =>
  css({
    "&": {
      width: "100%",
      overflow: "visible",
      backgroundColor: "var(--c_gray0)22",
      paddingLeft: "8px"
    },
    ".toolbar": {
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
    ".nodetool-logo": {
      margin: "1px 0.75em 0 0"
    },
    ".MuiIconButton-root": {
      width: "32px",
      height: "32px",
      padding: "6px",
      color: theme.palette.c_white,
      borderRadius: "6px",
      transition: "all 0.2s ease-out",
      "&:hover": {
        backgroundColor: "rgba(255, 255, 255, 0.05)"
      },
      "& svg": {
        display: "block",
        width: "20px",
        height: "20px",
        fontSize: "20px"
      }
    },
    ".logo-button": {
      "& svg": {
        color: "var(--c_warn)"
      },
      "&:hover": {
        backgroundColor: "rgba(255, 255, 255, 0.05)"
      }
    },
    ".navigate": {
      display: "flex",
      alignItems: "center",
      flex: "1 1 auto",
      gap: "8px"
    },
    ".buttons-right": {
      display: "flex",
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "center",
      background: "transparent",
      flexShrink: 0
    }
  });

const LogoButton = memo(function LogoButton() {
  const navigate = useNavigate();

  const handleClick = useCallback(() => {
    navigate("/welcome");
  }, [navigate]);

  return (
    <Tooltip
      title="Open Welcome Screen"
      enterDelay={TOOLTIP_ENTER_DELAY}
      placement="right"
    >
      <IconButton className="logo-button" onClick={handleClick} tabIndex={-1}>
        <Logo
          width="20px"
          height="20px"
          fontSize="1em"
          borderRadius="4px"
          small={true}
          singleLine={true}
        />
      </IconButton>
    </Tooltip>
  );
});

const DashboardButton = memo(function DashboardButton() {
  const navigate = useNavigate();

  const handleClick = useCallback(() => {
    navigate("/dashboard");
  }, [navigate]);

  return (
    <Tooltip
      title="Go to Dashboard"
      enterDelay={TOOLTIP_ENTER_DELAY}
      placement="right"
    >
      <IconButton
        className="dashboard-button"
        onClick={handleClick}
        tabIndex={-1}
      >
        <DashboardIcon />
      </IconButton>
    </Tooltip>
  );
});

const ChatButton = memo(function ChatButton() {
  const navigate = useNavigate();

  const handleClick = useCallback(() => {
    navigate("/chat");
  }, [navigate]);

  return (
    <Tooltip
      title="Go to Chat"
      enterDelay={TOOLTIP_ENTER_DELAY}
      placement="right"
    >
      <IconButton className="chat-button" onClick={handleClick} tabIndex={-1}>
        <ChatIcon />
      </IconButton>
    </Tooltip>
  );
});

const AppHeader: React.FC = memo(function AppHeader() {
  const navigate = useNavigate();
  const path = useLocation().pathname;

  return (
    <div css={styles} className="app-header">
      <Toolbar variant="dense" className="toolbar" tabIndex={-1}>
        <div className="navigate">
          <LogoButton />
          <DashboardButton />
          <ChatButton />
          <Box sx={{ flexGrow: 0.02 }} />
        </div>
        <Alert />
        <RightSideButtons />
      </Toolbar>
    </div>
  );
});

AppHeader.displayName = "AppHeader";

export default AppHeader;
