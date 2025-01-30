/** @jsxImportSource @emotion/react */
import React, { useCallback, useMemo } from "react";
import { css } from "@emotion/react";

import ThemeNodetool from "../themes/ThemeNodetool";
import { useResizePanel } from "../../hooks/handlers/useResizePanel";

// components
import SettingsMenu from "../menus/SettingsMenu";
import Help from "../content/Help/Help";
import Alert from "../node_editor/Alert";
import Logo from "../Logo";
import Welcome from "../content/Welcome/Welcome";
import AppHeaderActions from "./AppHeaderActions";
import LastWorkflowButton from "./LastWorkflowButton";
import OverallDownloadProgress from "../hugging_face/OverallDownloadProgress";
import NotificationButton from "./NotificationButton";

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
import { isDevelopment, isProduction } from "../../stores/ApiClient";

const styles = (theme: any, buttonAppearance: "text" | "icon" | "both") =>
  css({
    "&": {
      width: "100%",
      backgroundColor: theme.palette.c_gray0,
      overflow: "visible"
    },
    ".app-bar": {
      overflow: "visible"
    },
    ".toolbar": {
      overflow: "visible"
    },
    ".nodetool-logo": {
      margin: "0 1em 0 0em"
    },
    button: {
      fontSize:
        buttonAppearance === "text" || buttonAppearance === "both"
          ? theme.fontSizeSmaller
          : "0",
      color: theme.palette.c_white,
      "&:hover": {
        backgroundColor: theme.palette.c_gray2
      }
    },
    ".icon-container svg": {
      display:
        buttonAppearance === "icon" || buttonAppearance === "both"
          ? "block"
          : "none",
      width: "20px",
      height: "18px",

      fontSize:
        buttonAppearance === "icon" || buttonAppearance === "both"
          ? theme.fontSizeSmall
          : "0"
    },
    "button svg": {
      display:
        buttonAppearance === "icon" ||
        buttonAppearance === "both" ||
        ".command-icon svg"
          ? "block"
          : "none",
      padding: "0.1em",
      marginRight: "0.2em"
    },
    ".command-icon svg": {
      display: "block !important"
    },
    "button.logo:hover": {
      backgroundColor: "transparent"
    },
    ".nav-buttons": {
      display: "flex",
      flexDirection: "row",
      justifyContent: "flex-start",
      alignItems: "center",
      gap: "0.1em"
    },
    "nav-button": {
      flexShrink: 0,
      minWidth: "5em",
      "&.active": {
        color: theme.palette.c_hl1
      }
    },

    ".status-message": {
      margin: "auto",
      flexGrow: 0,
      flexShrink: 1,
      lineHeight: "1.1em",
      textAlign: "center",
      transform: "translateX(-50%)",
      left: "50%",
      position: "absolute",
      top: "91px",
      zIndex: 1000,
      backgroundColor: "#6f6f6fb5",
      padding: ".2em 1em",
      color: "black",
      fontSize: theme.fontSizeSmall
    },
    ".buttons-right": {
      display: "flex",
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "center",
      gap: "0"
    }
  });

interface AppHeaderProps {
  showActions?: boolean;
}

const AppHeader: React.FC<AppHeaderProps> = React.memo(
  (props: AppHeaderProps) => {
    const navigate = useNavigate();
    const path = useLocation().pathname;

    const globalButtonAppearance = useSettingsStore(
      (state) => state.settings.buttonAppearance
    );

    const [buttonAppearance, setButtonAppearance] = useState(
      globalButtonAppearance
    );

    const {
      helpOpen,
      welcomeOpen,
      handleCloseHelp,
      handleOpenHelp,
      handleCloseWelcome,
      handleOpenWelcome
    } = useAppHeaderStore();

    const showWelcomeOnStartup = useSettingsStore(
      (state) => state.settings.showWelcomeOnStartup
    );

    const { handlePanelToggle, collapsed: panelLeftCollapsed } =
      useResizePanel("left");

    const handleResize = useCallback(() => {
      if (window.innerWidth <= 1200) {
        setButtonAppearance("icon");
      } else {
        setButtonAppearance(globalButtonAppearance);
      }
    }, [globalButtonAppearance]);

    useEffect(() => {
      handleResize();
      window.addEventListener("resize", handleResize);
      return () => {
        window.removeEventListener("resize", handleResize);
      };
    }, [handleResize]);

    useEffect(() => {
      if (showWelcomeOnStartup) {
        handleOpenWelcome();
      }
    }, [handleOpenWelcome, showWelcomeOnStartup]);

    const memoizedStyles = useMemo(
      () => styles(ThemeNodetool, buttonAppearance),
      [buttonAppearance]
    );

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
              {buttonAppearance !== "text" && <ExamplesIcon />}
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
              {buttonAppearance !== "text" && (
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
              )}
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
                    : "#fff"
                }}
                bgStyle={{
                  backgroundColor: "transparent",
                  width: "28px"
                }}
              />
              Models
            </Button>
          </Tooltip>
        </Box>
      ),
      [path, buttonAppearance, navigate, panelLeftCollapsed, handlePanelToggle]
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
      [
        path,
        buttonAppearance,
        helpOpen,
        handleCloseHelp,
        navigate,
        handleOpenHelp
      ]
    );

    return (
      <div css={memoizedStyles} className="app-header">
        <AppBar position="static" className="app-bar">
          <Toolbar variant="dense" className="toolbar">
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
                  handleOpenWelcome();
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
            {isDevelopment && (
              <Popover
                open={welcomeOpen}
                onClose={handleCloseWelcome}
                anchorReference="none"
                style={{
                  position: "fixed",
                  width: "100%",
                  height: "100%",
                  top: "50%"
                }}
                slotProps={{
                  root: {
                    sx: {
                      top: "60px !important",
                      "& .MuiBackdrop-root": {
                        top: "60px !important",
                        position: "fixed"
                      }
                    }
                  },
                  paper: {
                    sx: {
                      position: "absolute",
                      top: "60px",
                      left: "50%",
                      transform: "translate(-50%, 0)"
                    }
                  }
                }}
              >
                <Welcome handleClose={handleCloseWelcome} />
              </Popover>
            )}

            <div className="navigate">
              <Box sx={{ flexGrow: 0.02 }} />
              {NavigationButtons}
            </div>

            {props.showActions && <AppHeaderActions />}
            {/* <LastWorkflowButton /> */}
            <Alert />
            {RightSideButtons}
          </Toolbar>
        </AppBar>
      </div>
    );
  }
);

AppHeader.displayName = "AppHeader";

export default AppHeader;
