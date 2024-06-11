/** @jsxImportSource @emotion/react */
import { useCallback, useState } from "react";
import { useReactFlow } from "reactflow";
// store
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { useSettingsStore } from "../../stores/SettingsStore";
// components
import SettingsMenu from "../menus/SettingsMenu";
import Help from "../content/Help/Help";
import Alert from "../node_editor/Alert";
import AppIconMenu from "../menus/AppIconMenu";
// icons
import AdjustIcon from "@mui/icons-material/Adjust";
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
import WorkflowsIcon from "@mui/icons-material/ListAlt";
import QuestionMarkIcon from "@mui/icons-material/QuestionMark";
import SaveIcon from "@mui/icons-material/Save";
import LayoutIcon from "@mui/icons-material/ViewModule";

//utils
import { iconForType } from "../../config/data_types";
import { useLocation, useNavigate } from "react-router-dom";
//constants
import { TOOLTIP_DELAY } from "../../config/constants";
//hooks
import { useHotkeys } from "react-hotkeys-hook";
import { useNodeStore } from "../../stores/NodeStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { Workflow } from "../../stores/ApiTypes";
import Logo from "../Logo";
import ThemeNodetool from "../themes/ThemeNodetool";

const styles = (theme: any, buttonAppearance: "text" | "icon" | "both") => ({
  ".nodetool-logo": {
    marginLeft: "-0.5em"
  },
  button: {
    fontSize:
      buttonAppearance === "text" || buttonAppearance === "both"
        ? theme.fontSizeSmall
        : "0",
    margin: "0 0 0 0.4em",
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
    minWidth: "25px",
    minHeight: "25px",
    fontSize:
      buttonAppearance === "icon" || buttonAppearance === "both"
        ? theme.fontSizeSmall
        : "0"
  },
  "button svg": {
    display:
      buttonAppearance === "icon" || buttonAppearance === "both"
        ? "block"
        : "none",
    marginRight: "0.1em"
  },
  "button.logo:hover": {
    backgroundColor: "transparent"
  },
  "nav-button": {
    "&.active": {
      color: theme.palette.c_hl1
    }
  },
  ".action-button": {
    fontSize:
      buttonAppearance === "text" || buttonAppearance === "both"
        ? theme.fontSizeSmall
        : "0",
    color: theme.palette.c_gray6,
    "&:hover": {
      backgroundColor: theme.palette.c_gray2
    }
  },
  ".action-button:hover": {
    color: theme.palette.c_hl1
  },
  ".action-button.disabled": {
    color: theme.palette.c_gray4
  },
  ".divider": {
    display: "inline-block",
    width: "1.5em",
    color: theme.palette.c_gray4,
    padding: "0 0.5em"
  },
  ".last-workflow": {
    fontSize: theme.fontSizeSmaller,
    fontFamily: theme.fontFamily,
    TextTransform: "none",
    color: theme.palette.c_white,
    padding: ".2em .3em",
    minHeight: "unset",
    height: "1.5em",
    TextDecoration: "none !important",
    marginLeft: "0.5em",
    fontWeight: "normal",
    "&:hover": {
      color: theme.palette.c_hl1
    }
  },
  ".last-workflow.disabled": {
    color: theme.palette.c_gray5
  },
  ".last-workflow span": {
    color: theme.palette.c_attention,
    fontSize: "1.2em",
    marginLeft: "0.2em"
  }
});

function AppHeader() {
  const navigate = useNavigate();
  const path = useLocation().pathname;
  const reactFlowInstance = useReactFlow();
  const { openNodeMenu } = useNodeMenuStore();
  const autoLayout = useNodeStore((state) => state.autoLayout);
  const saveWorkflow = useNodeStore((state) => state.saveWorkflow);
  const workflowIsDirty = useNodeStore((state) => state.workflowIsDirty);
  const buttonAppearance = useSettingsStore(
    (state) => state.settings.buttonAppearance
  );
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const lastWorkflow = useNodeStore((state) => state.lastWorkflow);
  const onWorkflowSaved = useCallback(
    (workflow: Workflow) => {
      addNotification({
        content: `Workflow ${workflow.name} saved`,
        type: "success",
        alert: true
      });
    },
    [addNotification]
  );

  useHotkeys("Alt+s", () => saveWorkflow().then(onWorkflowSaved));
  useHotkeys("Meta+s", () => saveWorkflow().then(onWorkflowSaved));
  useHotkeys("Alt+h", () => handleOpenHelp());
  useHotkeys("Meta+h", () => handleOpenHelp());
  useHotkeys("Ctrl+Space", () => handleOpenNodeMenu());

  // cmd menu
  const fitScreen = () => {
    reactFlowInstance.fitView({
      padding: 0.6
    });
  };

  const [helpOpen, sethelpOpen] = useState(false);

  // open help popover
  const handleOpenHelp = () => {
    sethelpOpen(true);
  };

  // close help popover
  const handleCloseHelp = () => {
    sethelpOpen(false);
  };

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const openAppIconMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const closeAppIconMenu = () => {
    setAnchorEl(null);
  };

  const handleOpenNodeMenu = () => {
    openNodeMenu(400, 200);
  };

  const handleAutoLayout = () => {
    autoLayout();
  };

  const handleNavigateToLastWorkflow = () => {
    if (lastWorkflow) {
      navigate(`/editor/${lastWorkflow.id}`);
    }
  };

  return (
    <AppBar
      css={styles(ThemeNodetool, buttonAppearance)}
      position="static"
      className="app-header"
    >
      <Toolbar variant="dense">
        <Button
          className="logo"
          onClick={openAppIconMenu}
          sx={{
            lineHeight: "1em",
            margin: 0,
            display: { xs: "none", sm: "block" }
          }}
        >
          <Logo
            width="40px"
            height="40px"
            fontSize="14px"
            borderRadius="20px"
            small={true}
          />
        </Button>
        <AppIconMenu anchorEl={anchorEl} handleClose={closeAppIconMenu} />

        <Box sx={{ flexGrow: 0.02 }} />
        <Box>
          <Tooltip title="Load and create workflows" enterDelay={TOOLTIP_DELAY}>
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

          <Tooltip title="View and manage Assets" enterDelay={TOOLTIP_DELAY}>
            <Button
              className={`nav-button ${path === "/assets" ? "active" : ""}`}
              onClick={() => navigate("/assets")}
            >
              {iconForType("asset", {
                fill: "white",
                containerStyle: {
                  margin: "0 .25em 0 0"
                },
                bgStyle: {
                  width: "1.7em",
                  height: "1.7em"
                },
                width: "1.7em",
                height: "1.7em"
              })}
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
                      display: "block"
                    }}
                  >
                    Open NodeMenu
                  </span>
                  <span
                    style={{
                      fontSize: "1em",
                      color: "white",
                      textAlign: "center",
                      display: "block"
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
                <AdjustIcon />
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

        <Button
          onClick={handleNavigateToLastWorkflow}
          disabled={path.startsWith("/editor")}
          className={`last-workflow ${
            path.startsWith("/editor") ? "disabled" : ""
          }`}
        >
          {lastWorkflow?.name}
          {workflowIsDirty && <span>*</span>}
        </Button>

        <Box sx={{ flexGrow: 1 }} />

        <Box>
          <Alert />
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
              transform: "translate(-50%, -50%)"
            }}
          >
            <Help />
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
            </Button>
          </Tooltip>
          <SettingsMenu />
        </Box>
      </Toolbar>
    </AppBar>
  );
}

export default AppHeader;
