/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import ThemeNodetool from "../themes/ThemeNodetool";

import { useCallback, useState } from "react";
// store
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { useSettingsStore } from "../../stores/SettingsStore";
// components
import SettingsMenu from "../menus/SettingsMenu";
import Help from "../content/Help/Help";
import Alert from "../node_editor/Alert";
// icons
import NodesIcon from "@mui/icons-material/CircleOutlined";
import AssetIcon from "@mui/icons-material/ImageSharp";
import WorkflowsIcon from "@mui/icons-material/ListAlt";
import QuestionMarkIcon from "@mui/icons-material/QuestionMark";
import SaveIcon from "@mui/icons-material/Save";
import LayoutIcon from "@mui/icons-material/ViewModule";
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

//utils
import { useLocation, useNavigate } from "react-router-dom";
//constants
import { TOOLTIP_DELAY } from "../../config/constants";
//hooks
import { useHotkeys } from "react-hotkeys-hook";
import { useNodeStore } from "../../stores/NodeStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { Workflow } from "../../stores/ApiTypes";
import useWorkflowRunnner from "../../stores/WorkflowRunner";
// components
import Logo from "../Logo";
import Welcome from "../content/Welcome/Welcome";
import { useAppHeaderStore } from "../../stores/AppHeaderStore";

const styles = (theme: any, buttonAppearance: "text" | "icon" | "both") =>
  css({
    ".nodetool-logo": {
      marginLeft: "-0.5em",
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
      marginRight: "0.4em",
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
    ".action-button": {
      flexShrink: 0,
      minWidth: "6em",
      fontSize:
        buttonAppearance === "text" || buttonAppearance === "both"
          ? theme.fontSizeSmall
          : "0",
      color: theme.palette.c_gray6,
      "&:hover": {
        backgroundColor: theme.palette.c_gray2,
      },
      margin: "0 0.5em",
    },
    ".action-button:hover": {
      color: theme.palette.c_hl1,
    },
    ".action-button.disabled": {
      color: theme.palette.c_gray4,
    },
    ".divider": {
      display: "inline-block",
      width: ".2em",
      color: theme.palette.c_gray4,
      padding: "0 .1em",
    },
    ".last-workflow": {
      fontSize: theme.fontSizeSmaller,
      fontFamily: theme.fontFamily,
      lineHeight: "1.1em",
      textTransform: "none",
      color: theme.palette.c_white,
      padding: ".2em .3em",
      minHeight: "unset",
      height: "1.5em",
      textDecoration: "none !important",
      marginLeft: "0.5em",
      fontWeight: "normal",
      "&:hover": {
        color: theme.palette.c_hl1,
      },
    },
    ".last-workflow.disabled": {
      color: theme.palette.c_gray5,
    },
    ".last-workflow span": {
      color: theme.palette.c_attention,
      fontSize: "1.2em",
      marginLeft: "0.2em",
    },
    ".status-message": {
      margin: "auto",
      padding: "0 .5em",
      flexGrow: 0,
      flexShrink: 1,
      lineHeight: "1.1em",
      textAlign: "right",
      color: theme.palette.c_gray5,
      backgroundColor: "transparent",
      transform: "translateX(0%)",
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
  // const reactFlowInstance = useReactFlow();
  const openNodeMenu = useNodeMenuStore((state) => state.openNodeMenu);
  const autoLayout = useNodeStore((state) => state.autoLayout);
  const saveWorkflow = useNodeStore((state) => state.saveWorkflow);
  const workflowIsDirty = useNodeStore((state) => state.getWorkflowIsDirty());
  const areMessagesVisible = true;
  const buttonAppearance = useSettingsStore(
    (state) => state.settings.buttonAppearance
  );
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const lastWorkflow = useNodeStore((state) => state.lastWorkflow);
  const statusMessage = useWorkflowRunnner((state) => state.statusMessage);

  const onWorkflowSaved = useCallback(
    (workflow: Workflow) => {
      addNotification({
        content: `Workflow ${workflow.name} saved`,
        type: "success",
        alert: true,
      });
    },
    [addNotification]
  );

  useHotkeys("Alt+s", () => saveWorkflow().then(onWorkflowSaved));
  useHotkeys("Meta+s", () => saveWorkflow().then(onWorkflowSaved));
  useHotkeys("Alt+h", () => handleOpenHelp());
  useHotkeys("Meta+h", () => handleOpenHelp());
  useHotkeys("Alt+w", () => handleOpenWelcome());
  useHotkeys("Meta+w", () => handleOpenWelcome());
  useHotkeys("Ctrl+Space", () => handleOpenNodeMenu());

  // cmd menu
  // const fitScreen = () => {
  //   reactFlowInstance.fitView({
  //     padding: 0.6
  //   });
  // };


  const {
    helpOpen,
    welcomeOpen,
    handleOpenChat,
    handleOpenHelp,
    handleCloseHelp,
    handleOpenWelcome,
    handleCloseWelcome,
  } = useAppHeaderStore();

  // node menu
  const handleOpenNodeMenu = () => {
    openNodeMenu(400, 200);
  };

  // auto layout
  const handleAutoLayout = () => {
    autoLayout();
  };

  const handleNavigateToLastWorkflow = () => {
    if (lastWorkflow) {
      navigate(`/editor/${lastWorkflow.id}`);
    }
  };

  return (
    <div css={styles(ThemeNodetool, buttonAppearance)} className="app-header">
      <AppBar position="static" className="app-header">
        <Toolbar variant="dense">
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
                margin: 0,
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
              // left: "50%"
              // transform: "translate(-50%, -50%)"
            }}
            slotProps={{
              root: {
                sx: {
                  top: "60px !important", // Set the whole Popover 60px from the top
                  "& .MuiBackdrop-root": {
                    top: "60px !important", // Set the backdrop 60px from the top
                    position: "fixed",
                  },
                },
              },
              paper: {
                sx: {
                  position: "absolute",
                  top: "60px", // This will apply the top offset to the paper content inside the popover
                  left: "50%",
                  transform: "translate(-50%, 0)", // Adjust the transform if necessary
                },
              },
            }}
          >
            <Welcome handleClose={handleCloseWelcome} />
          </Popover>

          <Box sx={{ flexGrow: 0.02 }} />
          <Box className="nav-buttons">
            <Tooltip
              title="Load and create workflows"
              enterDelay={TOOLTIP_DELAY}
            >
              <Button
                aria-controls="simple-menu"
                aria-haspopup="true"
                className={`nav-button ${path.startsWith("/workflows") ? "active" : ""
                  }`}
                onClick={() => navigate("/workflows")}
              >
                <WorkflowsIcon />
                Workflows
              </Button>
            </Tooltip>

            <Tooltip title="View and manage Assets" enterDelay={TOOLTIP_DELAY}>
              <Button
                className={`nav-button ${path === "/assets" ? "active" : ""}`}
                onClick={() => navigate("/assets")}
              >
                <AssetIcon />
                Assets
              </Button>
            </Tooltip>
            <div className="divider">|</div>
            {path.startsWith("/editor") && (
              <Tooltip
                title={
                  <>
                    <span
                      style={{
                        fontSize: "1.2em",
                        color: "white",
                        textAlign: "center",
                        display: "block",
                      }}
                    >
                      Open NodeMenu
                    </span>
                    <span
                      style={{
                        fontSize: "1em",
                        color: "white",
                        textAlign: "center",
                        display: "block",
                      }}
                    >
                      Ctrl+Space
                      <br /> Double Click on Canvas
                    </span>
                  </>
                }
                enterDelay={TOOLTIP_DELAY}
              >
                <Button className="action-button" onClick={handleOpenNodeMenu}>
                  <NodesIcon />
                  Nodes
                </Button>
              </Tooltip>
            )}
          </Box>

          {path.startsWith("/editor") && (
            <>
              <Tooltip
                title="Arranges all nodes or selected nodes"
                enterDelay={TOOLTIP_DELAY}
              >
                <Button className="action-button" onClick={handleAutoLayout}>
                  <LayoutIcon />
                  AutoLayout
                </Button>
              </Tooltip>
              <Tooltip title="Save workflow" enterDelay={TOOLTIP_DELAY}>
                <Button
                  className="action-button"
                  onClick={() => saveWorkflow().then(onWorkflowSaved)}
                >
                  <SaveIcon />
                  Save
                </Button>
              </Tooltip>
            </>
          )}
          <Tooltip title="Open Nodetool Chat Assistant" enterDelay={TOOLTIP_DELAY}>
            <Button
              className="action-button"
              onClick={handleOpenChat}
            >
              <ChatIcon />
              Chat
            </Button>
          </Tooltip>

          <Button
            onClick={handleNavigateToLastWorkflow}
            disabled={path.startsWith("/editor")}
            className={`last-workflow ${path.startsWith("/editor") ? "disabled" : ""
              }`}
          >
            {lastWorkflow?.name}
            {workflowIsDirty && <span>*</span>}
          </Button>

          <Box sx={{ flexGrow: 1 }} />
          {areMessagesVisible && (
            <Typography
              className="status-message"
              variant="caption"
              color="inherit"
            >
              {statusMessage || ""}
            </Typography>
          )}

          {/* ALERT */}
          <Alert />

          {/* BUTTONS RIGHT */}
          <Box className="buttons-right">
            {/* help */}
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
