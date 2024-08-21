/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import ThemeNodetool from "../themes/ThemeNodetool";

// components
import SettingsMenu from "../menus/SettingsMenu";
import Help from "../content/Help/Help";
import Alert from "../node_editor/Alert";
import Logo from "../Logo";
import Welcome from "../content/Welcome/Welcome";
import AppHeaderActions from "./AppHeaderActions";
import LastWorkflowButton from "./LastWorkflowButton";

// mui icons
import WorkflowsIcon from "@mui/icons-material/ListAlt";
import AssetIcon from "@mui/icons-material/ImageSharp";
import QuestionMarkIcon from "@mui/icons-material/QuestionMark";
import ChatIcon from "@mui/icons-material/Chat";

// mui
import {
  AppBar,
  Button,
  Popover,
  Tooltip,
  Toolbar,
  Typography,
  Box,
} from "@mui/material";

// hooks and stores
import { useLocation, useNavigate } from "react-router-dom";
import { useSettingsStore } from "../../stores/SettingsStore";
import { useAppHeaderStore } from "../../stores/AppHeaderStore";
import { useResizePanel } from "../../hooks/handlers/useResizePanel";

// constants
import { TOOLTIP_DELAY } from "../../config/constants";
import { useEffect, useState } from "react";

const styles = (theme: any, buttonAppearance: "text" | "icon" | "both") =>
  css({
    "&": {
      width: "100%",
      backgroundColor: theme.palette.c_gray0,
      overflow: "visible",
    },
    ".app-bar": {
      overflow: "visible",
    },
    ".toolbar": {
      overflow: "visible",
    },
    ".nodetool-logo": {
      margin: "0 2em 0 0em",
    },
    button: {
      fontSize:
        buttonAppearance === "text" || buttonAppearance === "both"
          ? theme.fontSizeSmall
          : "0",
      color: theme.palette.c_white,
      "&:hover": {
        backgroundColor: theme.palette.c_gray2,
      },
    },
    ".icon-container svg": {
      display:
        buttonAppearance === "icon" || buttonAppearance === "both"
          ? "block"
          : "none",
      minWidth: "25px",
      minHeight: "25px",
      fontSize:
        buttonAppearance === "icon" || buttonAppearance === "both"
          ? theme.fontSizeSmall
          : "0",
    },
    "button svg": {
      display:
        buttonAppearance === "icon" || buttonAppearance === "both"
          ? "block"
          : "none",
      padding: "0.1em",
      marginRight: "0.2em",
      // marginRight: "0.4em",
    },
    "button.logo:hover": {
      backgroundColor: "transparent",
    },
    ".nav-buttons": {
      display: "flex",
      flexDirection: "row",
      justifyContent: "flex-start",
      alignItems: "center",
      gap: "0.5em",
    },
    "nav-button": {
      flexShrink: 0,
      minWidth: "5em",
      "&.active": {
        color: theme.palette.c_hl1,
      },
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
      fontSize: theme.fontSizeSmall,
    },
    ".buttons-right": {
      display: "flex",
      flexDirection: "row",
      justifyContent: "flex-end",
      alignItems: "center",
      gap: "0",
    },
  });

function AppHeader() {
  const navigate = useNavigate();
  const path = useLocation().pathname;

  const globalButtonAppearance = useSettingsStore(
    (state) => state.settings.buttonAppearance
  );

  // Local state to manage button appearance based on screen size
  const [buttonAppearance, setButtonAppearance] = useState(
    globalButtonAppearance
  );

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 1200) {
        setButtonAppearance("icon");
      } else {
        setButtonAppearance(globalButtonAppearance);
      }
    };

    // Initialize on component mount
    handleResize();

    // Add event listener for window resize
    window.addEventListener("resize", handleResize);

    // Cleanup the event listener on unmount
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [globalButtonAppearance]);

  const {
    helpOpen,
    welcomeOpen,
    handleCloseHelp,
    handleOpenHelp,
    handleCloseWelcome,
    handleOpenWelcome,
  } = useAppHeaderStore();

  const { handlePanelToggle: toggleChat } = useResizePanel("left");

  return (
    <div css={styles(ThemeNodetool, buttonAppearance)} className="app-header">
      <AppBar position="static" className="app-bar">
        <Toolbar variant="dense" className="toolbar">
          <Tooltip
            enterDelay={TOOLTIP_DELAY}
            title={
              <div style={{ textAlign: "center" }}>
                <Typography variant="inherit">NodeTool</Typography>
                <Typography variant="inherit">[ALT+W | OPTION+W]</Typography>
              </div>
            }
          >
            <Button
              className="logo"
              onClick={(e) => {
                e.preventDefault();
                handleOpenWelcome();
              }}
              sx={{
                lineHeight: "1em",
                display: { xs: "none", sm: "block" },
              }}
            >
              <Logo
                width="80px"
                height="20px"
                fontSize="14px"
                borderRadius="20px"
                small={true}
                singleLine={true}
              />
            </Button>
          </Tooltip>
          <Popover
            open={welcomeOpen}
            onClose={handleCloseWelcome}
            anchorReference="none"
            style={{
              position: "fixed",
              width: "100%",
              height: "100%",
              top: "50%",
            }}
            slotProps={{
              root: {
                sx: {
                  top: "60px !important",
                  "& .MuiBackdrop-root": {
                    top: "60px !important",
                    position: "fixed",
                  },
                },
              },
              paper: {
                sx: {
                  position: "absolute",
                  top: "60px",
                  left: "50%",
                  transform: "translate(-50%, 0)",
                },
              },
            }}
          >
            <Welcome handleClose={handleCloseWelcome} />
          </Popover>

          <div className="navigate">
            <Box sx={{ flexGrow: 0.02 }} />
            <Box className="nav-buttons">
              <Tooltip
                title="Load and create workflows"
                enterDelay={TOOLTIP_DELAY}
              >
                <Button
                  aria-controls="simple-menu"
                  aria-haspopup="true"
                  className={`nav-button ${
                    path.startsWith("/workflows") ? "active" : ""
                  }`}
                  onClick={() => navigate("/workflows")}
                >
                  <WorkflowsIcon />
                  Workflows
                </Button>
              </Tooltip>

              <Tooltip
                title="View and manage Assets"
                enterDelay={TOOLTIP_DELAY}
              >
                <Button
                  className={`nav-button ${path === "/assets" ? "active" : ""}`}
                  onClick={() => navigate("/assets")}
                >
                  <AssetIcon />
                  Assets
                </Button>
              </Tooltip>
              <Tooltip
                title="Open Nodetool Chat Assistant"
                enterDelay={TOOLTIP_DELAY}
              >
                <Button className="action-button" onClick={toggleChat}>
                  <ChatIcon />
                  Chat
                </Button>
              </Tooltip>
            </Box>
          </div>

          <AppHeaderActions />
          <LastWorkflowButton />
          <Alert />

          <Box className="buttons-right">
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
                transform: "translate(-50%, -50%)",
              }}
            >
              <Help handleClose={handleCloseHelp} />
            </Popover>
            <Tooltip
              enterDelay={TOOLTIP_DELAY}
              title={
                <div style={{ textAlign: "center" }}>
                  <Typography variant="inherit">Help</Typography>
                  <Typography variant="inherit">[ALT+H | OPTION+H]</Typography>
                </div>
              }
            >
              <Button
                className="command-icon"
                onClick={(e) => {
                  e.preventDefault();
                  handleOpenHelp();
                }}
              >
                <QuestionMarkIcon />
                Help
              </Button>
            </Tooltip>
            <SettingsMenu />
          </Box>
        </Toolbar>
      </AppBar>
    </div>
  );
}

export default AppHeader;
