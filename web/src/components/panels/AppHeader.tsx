/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useCallback } from "react";
import { Tooltip, Toolbar, Box, IconButton, Typography } from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import RightSideButtons from "./RightSideButtons";
import DashboardIcon from "@mui/icons-material/Dashboard";
import ExamplesIcon from "@mui/icons-material/Fluorescent";
import Logo from "../Logo";

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
      "& svg": {
        display: "block",
        width: "18px",
        height: "18px",
        fontSize: "18px",
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
      borderRadius: "10px",
      boxShadow: `inset 0 0 0 1px ${theme.vars.palette.divider}`
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
      display: "inline"
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

const ExamplesButton = memo(function ExamplesButton({
  isActive
}: {
  isActive: boolean;
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

  return (
    <div css={styles(theme)} className="app-header">
      <Toolbar variant="dense" className="toolbar" tabIndex={-1}>
        <div className="navigate">
          <div className="logo-container">
            <Logo
              small
              width="20px"
              height="20px"
              fontSize="1em"
              borderRadius="4px"
            />
          </div>
          <div className="nav-group">
            <DashboardButton isActive={path.startsWith("/dashboard")} />
            <ExamplesButton isActive={path.startsWith("/examples")} />
          </div>
          <Box sx={{ flexGrow: 0.02 }} />
        </div>
        <RightSideButtons />
      </Toolbar>
    </div>
  );
});

AppHeader.displayName = "AppHeader";

export default AppHeader;
