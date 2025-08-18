/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useCallback } from "react";
import Logo from "../Logo";
import { Tooltip, Toolbar, Box, IconButton, Typography, useMediaQuery } from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import RightSideButtons from "./RightSideButtons";
import DashboardIcon from "@mui/icons-material/Dashboard";
import ExamplesIcon from "@mui/icons-material/Fluorescent";

const styles = (theme: Theme, isMobile: boolean) =>
  css({
    "&": {
      width: "100%",
      maxWidth: "100vw",
      overflow: "hidden", // Prevent overflow
      backgroundColor: theme.vars.palette.grey[900],
      paddingLeft: isMobile ? "4px" : "8px",
      minHeight: isMobile ? "56px" : "40px",
      height: isMobile ? "56px" : "40px", // Fixed height
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1100,
      borderBottom: isMobile ? "1px solid rgba(255, 255, 255, 0.1)" : "none",
      backdropFilter: "saturate(180%) blur(20px)",
      WebkitBackdropFilter: "saturate(180%) blur(20px)",
      boxShadow: isMobile ? "0 2px 8px rgba(0, 0, 0, 0.15)" : "none",
      boxSizing: "border-box"
    },
    ".toolbar": {
      backgroundColor: "transparent",
      overflow: "hidden", // Prevent toolbar overflow
      display: "flex !important",
      justifyContent: "space-between",
      alignItems: "center",
      position: "relative",
      height: isMobile ? "56px" : "40px",
      minHeight: isMobile ? "56px" : "40px",
      maxHeight: isMobile ? "56px" : "40px", // Prevent expansion
      padding: isMobile ? "0 8px" : "0 2px 0 12px",
      border: "0",
      width: "100%",
      maxWidth: "100%",
      boxSizing: "border-box"
    },
    ".nodetool-logo": {
      margin: isMobile ? "1px 0.5em 0 0" : "1px 0.75em 0 0"
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
      "& svg": {
        display: "block",
        width: "18px",
        height: "18px",
        fontSize: "18px",
        marginRight: isMobile ? "0" : "4px"
      }
    },
    ".logo-button": {
      "& svg": {
        color: "var(--palette-warning-main)"
      },
      "&:hover": {
        backgroundColor: "rgba(255, 255, 255, 0.05)"
      }
    },
    ".navigate": {
      display: "flex !important",
      alignItems: "center",
      flex: "1 1 auto",
      gap: isMobile ? "4px" : "8px",
      visibility: "visible"
    },
    ".nav-group": {
      display: "flex",
      alignItems: "center",
      gap: isMobile ? "2px" : "6px",
      padding: isMobile ? "2px" : "2px 4px",
      borderRadius: "10px",
      backgroundColor: theme.vars.palette.action.hover,
      boxShadow: `inset 0 0 0 1px ${theme.vars.palette.divider}`
    },
    ".nav-button": {
      padding: isMobile ? "6px" : "4px 8px",
      borderRadius: "8px",
      fontWeight: 600,
      letterSpacing: "0.01em",
      color: theme.vars.palette.grey[100],
      minWidth: isMobile ? "32px" : "auto",
      "& svg": {
        marginRight: isMobile ? "0" : "6px"
      },
      position: "relative",
      "&.active": {
        backgroundColor: theme.vars.palette.action.selected,
        color: theme.vars.palette.primary.main,
        boxShadow: `0 0 0 1px ${theme.vars.palette.primary.main}55 inset, 0 6px 22px ${theme.vars.palette.primary.main}10`,
        "& svg": {
          color: theme.vars.palette.primary.main
        }
      },
      "&.active::after": {
        content: '""',
        position: "absolute",
        left: "10%",
        right: "10%",
        bottom: "-6px",
        height: "2px",
        borderRadius: "2px",
        background: theme.vars.palette.primary.main,
        opacity: 0.85
      }
    },
    ".nav-button-text": {
      display: isMobile ? "none" : "inline"
    },
    ".buttons-right": {
      display: "flex",
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "center",
      background: "transparent",
      flexShrink: 0,
      marginRight: isMobile ? "2px" : "4px"
    },
    // Mobile styles handled via separate CSS file
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
      placement="bottom"
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

const DashboardButton = memo(function DashboardButton({
  isActive,
  isMobile
}: {
  isActive: boolean;
  isMobile: boolean;
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

const ExamplesButton = memo(function ExamplesButton({
  isActive,
  isMobile
}: {
  isActive: boolean;
  isMobile: boolean;
}) {
  const navigate = useNavigate();
  const theme = useTheme();

  const handleClick = useCallback(() => {
    navigate("/examples");
  }, [navigate]);

  return (
    <Tooltip
      title="Explore Examples"
      enterDelay={TOOLTIP_ENTER_DELAY}
      placement="bottom"
    >
      <IconButton
        className={`nav-button examples-button ${isActive ? "active" : ""}`}
        onClick={handleClick}
        tabIndex={-1}
        aria-current={isActive ? "page" : undefined}
      >
        <ExamplesIcon />
        <span className="nav-button-text">Examples</span>
      </IconButton>
    </Tooltip>
  );
});

const AppHeader: React.FC = memo(function AppHeader() {
  const theme = useTheme();
  const path = useLocation().pathname;
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <div css={styles(theme, isMobile)} className="app-header">
      <Toolbar variant="dense" className="toolbar" tabIndex={-1}>
        <div className="navigate">
          <LogoButton />
          <div className="nav-group">
            <DashboardButton 
              isActive={path.startsWith("/dashboard")} 
              isMobile={isMobile}
            />
            <ExamplesButton 
              isActive={path.startsWith("/examples")} 
              isMobile={isMobile}
            />
          </div>
          <Box sx={{ flexGrow: 0.02 }} />
        </div>
        <RightSideButtons isMobile={isMobile} />
      </Toolbar>
    </div>
  );
});

AppHeader.displayName = "AppHeader";

export default AppHeader;
