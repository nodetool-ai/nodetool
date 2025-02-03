/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";

import ThemeNodetool from "../themes/ThemeNodetool";
import { useResizePanel } from "../../hooks/handlers/useResizePanel";

// components
import SettingsMenu from "../menus/SettingsMenu";
import Help from "../content/Help/Help";
import Alert from "../node_editor/Alert";
import Logo from "../Logo";
import OverallDownloadProgress from "../hugging_face/OverallDownloadProgress";
import NotificationButton from "./NotificationButton";
import KeyboardBackspaceIcon from "@mui/icons-material/KeyboardBackspace";

// mui icons
import QuestionMarkIcon from "@mui/icons-material/QuestionMark";
import ExamplesIcon from "@mui/icons-material/AutoAwesome"; // Add this import

// nodetool icons
import { IconForType } from "../../config/data_types";

// mui
import {
  AppBar,
  Button,
  Popover,
  Tooltip,
  Toolbar,
  Typography,
  Box
} from "@mui/material";

// hooks and stores
import { useLocation, useNavigate } from "react-router-dom";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useAppHeaderStore } from "../../stores/AppHeaderStore";

// constants
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useEffect, useState } from "react";
import SystemStatsDisplay from "./SystemStats";
import { isProduction } from "../../stores/ApiClient";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";

const styles = (theme: any) =>
  css({
    "&": {
      width: "100%",
      // height: "40px",
      // backgroundColor: "rgba(18, 18, 24, 0.95)",
      backgroundColor: theme.palette.c_gray1,
      overflow: "visible"
    },
    ".app-bar": {
      overflow: "visible",
      boxShadow: "none",
      "&::after": {
        content: '""',
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: "1px",
        background: "rgba(255, 255, 255, 0.05)"
      }
    },
    ".toolbar": {
      overflow: "visible",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      position: "relative"
    },
    ".nodetool-logo": {
      margin: "1px 1.5em 0 0"
    },
    button: {
      fontSize: theme.fontSizeSmaller,
      color: theme.palette.c_white,
      "&:hover": {
        backgroundColor: "rgba(255, 255, 255, 0.1)"
      }
    },
    ".icon-container svg": {
      display: "block",
      width: "20px",
      height: "18px",
      fontSize: theme.fontSizeSmall
    },
    "button svg": {
      display: "block",
      padding: "0.1em"
    },
    ".command-icon svg": {
      display: "block !important"
    },
    "button.logo:hover": {
      backgroundColor: "transparent"
    },
    ".nav-buttons": {
      width: "100%",
      display: "flex",
      flexDirection: "row",
      justifyContent: "flex-start",
      alignItems: "center",
      gap: "0.1em",
      "& button": {
        lineHeight: "1.1em"
      }
    },
    ".nav-button svg": {
      marginRight: "0.2em"
    },
    "nav-button": {
      flexShrink: 0,
      minWidth: "5em",
      "&.active": {
        color: theme.palette.c_hl1
      }
    },
    ".back-to-editor": {
      marginLeft: "100px",
      marginRight: "auto"
    },
    ".navigate": {
      display: "flex",
      alignItems: "center",
      width: "100%"
    },
    ".buttons-right": {
      display: "flex",
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "center",
      gap: 0,
      background: theme.palette.c_gray1,
      borderRadius: "12px",
      paddingLeft: "1em",
      marginLeft: "auto",
      flexShrink: 0
    }
  });

const BackToEditorButton = memo(() => {
  const { currentWorkflowId } = useWorkflowManager((state) => ({
    currentWorkflowId: state.currentWorkflowId
  }));
  const navigate = useNavigate();
  return (
    <Button
      className="nav-button back-to-editor"
      onClick={() => navigate(`/editor/${currentWorkflowId || ""}`)}
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "4px",
        backgroundColor: "rgba(255, 255, 255, 0.05)",
        "&:hover": {
          backgroundColor: "rgba(255, 255, 255, 0.1)"
        },
        borderRadius: "4px",
        padding: "6px 12px"
      }}
    >
      <KeyboardBackspaceIcon sx={{ fontSize: "20px" }} />
      <span>Back to Editor</span>
    </Button>
  );
});

interface AppHeaderProps {}

const AppHeader: React.FC<AppHeaderProps> = React.memo(() => {
  const navigate = useNavigate();
  const path = useLocation().pathname;

  const { helpOpen, handleCloseHelp, handleOpenHelp } = useAppHeaderStore();

  const { handlePanelToggle, collapsed: panelLeftCollapsed } =
    useResizePanel("left");

  const NavigationButtons = useMemo(
    () => (
      <Box className="nav-buttons">
        <Tooltip title="Explore Examples" enterDelay={TOOLTIP_ENTER_DELAY}>
          <Button
            className={`nav-button ${path === "/examples" ? "active" : ""}`}
            onClick={() => {
              navigate("/examples");
              if (!panelLeftCollapsed) {
                handlePanelToggle();
              }
            }}
            tabIndex={-1}
            style={{
              color: path.startsWith("/examples")
                ? ThemeNodetool.palette.c_hl1
                : ThemeNodetool.palette.c_white
            }}
          >
            <ExamplesIcon />
            Examples
          </Button>
        </Tooltip>

        <Tooltip
          title="View and manage Assets"
          enterDelay={TOOLTIP_ENTER_DELAY}
        >
          <Button
            className={`nav-button ${path === "/assets" ? "active" : ""}`}
            onClick={() => {
              navigate("/assets");
              if (!panelLeftCollapsed) {
                handlePanelToggle();
              }
            }}
            tabIndex={-1}
            style={{
              color: path.startsWith("/assets")
                ? ThemeNodetool.palette.c_hl1
                : ThemeNodetool.palette.c_white
            }}
          >
            <IconForType
              iconName="asset"
              showTooltip={false}
              svgProps={{
                fill: path.startsWith("/assets")
                  ? ThemeNodetool.palette.c_hl1
                  : ThemeNodetool.palette.c_white
              }}
              containerStyle={{
                borderRadius: "0 0 3px 0",
                marginLeft: "0.1em",
                marginTop: "0"
              }}
              bgStyle={{
                backgroundColor: "transparent",
                width: "30px",
                height: "20px"
              }}
            />
            Assets
          </Button>
        </Tooltip>
        <Tooltip title="Model Manager" enterDelay={TOOLTIP_ENTER_DELAY}>
          <Button
            className="command-icon"
            onClick={() => navigate("/models")}
            tabIndex={-1}
            style={{
              color: path.startsWith("/models")
                ? ThemeNodetool.palette.c_hl1
                : ThemeNodetool.palette.c_white
            }}
          >
            <IconForType
              iconName="model"
              showTooltip={false}
              svgProps={{
                fill: path.startsWith("/models")
                  ? ThemeNodetool.palette.c_hl1
                  : ThemeNodetool.palette.c_white
              }}
              bgStyle={{
                backgroundColor: "transparent",
                width: "28px"
              }}
            />
            Models
          </Button>
        </Tooltip>
        {!path.startsWith("/editor") && (
          <Tooltip title="Back to Editor" enterDelay={TOOLTIP_ENTER_DELAY}>
            <BackToEditorButton />
          </Tooltip>
        )}
      </Box>
    ),
    [path, navigate, panelLeftCollapsed, handlePanelToggle]
  );

  const RightSideButtons = useMemo(
    () => (
      <Box className="buttons-right">
        {!isProduction && (
          <>
            <SystemStatsDisplay />
            <OverallDownloadProgress />
          </>
        )}
        <NotificationButton />
        <Popover
          open={helpOpen}
          onClose={handleCloseHelp}
          anchorReference="none"
          style={{
            position: "fixed",
            width: "100%",
            height: "100%",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)"
          }}
        >
          <Help handleClose={handleCloseHelp} />
        </Popover>
        <Tooltip
          enterDelay={TOOLTIP_ENTER_DELAY}
          title={
            <div style={{ textAlign: "center" }}>
              <Typography variant="inherit">Help</Typography>
            </div>
          }
        >
          <Button
            className="command-icon"
            onClick={(e) => {
              e.preventDefault();
              handleOpenHelp();
            }}
            tabIndex={-1}
          >
            <QuestionMarkIcon />
          </Button>
        </Tooltip>
        <SettingsMenu />
      </Box>
    ),
    [path, helpOpen, handleCloseHelp, navigate, handleOpenHelp]
  );

  return (
    <div css={styles} className="app-header">
      <AppBar position="static" className="app-bar">
        <Toolbar variant="dense" className="toolbar">
          <div className="navigate">
            <Tooltip
              enterDelay={TOOLTIP_ENTER_DELAY}
              title={
                <div style={{ textAlign: "center" }}>
                  <Typography variant="inherit">Open Welcome Screen</Typography>
                </div>
              }
            >
              <Button
                className="logo"
                tabIndex={-1}
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/welcome");
                }}
                sx={{
                  lineHeight: "1em",
                  display: { xs: "none", sm: "block" }
                }}
              >
                <Logo
                  width="80px"
                  height="24px"
                  fontSize="1em"
                  borderRadius="20px"
                  small={true}
                  singleLine={true}
                />
              </Button>
            </Tooltip>
            <Box sx={{ flexGrow: 0.02 }} />
            {NavigationButtons}
          </div>
          <Alert />
          {RightSideButtons}
        </Toolbar>
      </AppBar>
    </div>
  );
});

AppHeader.displayName = "AppHeader";

export default AppHeader;
