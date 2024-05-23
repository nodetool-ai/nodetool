/** @jsxImportSource @emotion/react */
import { useState } from "react";
import { useReactFlow } from "reactflow";
// store
import useWorkflowRunnner from "../../stores/WorkflowRunner";
import useNodeMenuStore from "../../stores/NodeMenuStore";
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

//utils
import { iconForType } from "../../config/data_types";
import { useLocation, useNavigate } from "react-router-dom";
//constants
import { TOOLTIP_DELAY } from "../../config/constants";
//hooks
import { useHotkeys } from "react-hotkeys-hook";

const styles = (theme: any) => ({
  button: {
    margin: "0 0 0 0.4em",
    color: theme.palette.c_white,
    "&:hover": {
      backgroundColor: theme.palette.c_gray2
    }
  },
  "nav-button": {
    "&.active": {
      color: theme.palette.c_hl1
    }
  },
  "button svg": {
    marginRight: "0.1em"
  }
});

// function AppHeader({ openCommandMenu }: Props) {
function AppHeader() {
  const navigate = useNavigate();
  const path = useLocation().pathname;
  const reactFlowInstance = useReactFlow();
  const [openCommandMenu, setOpenCommandMenu] = useState(false);
  const { openNodeMenu } = useNodeMenuStore();

  useHotkeys("Alt+s", () => fitScreen());
  useHotkeys("Meta+s", () => fitScreen());
  useHotkeys("Alt+h", () => handleOpenHelp());
  useHotkeys("Meta+h", () => handleOpenHelp());
  useHotkeys("Ctrl+Space", () => handleOpenNodeMenu());

  // cmd menu
  useHotkeys("Alt+k", () => setOpenCommandMenu(true));
  useHotkeys("Meta+k", () => setOpenCommandMenu(true));

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

  return (
    <AppBar css={styles} position="static" className="app-header">
      <Toolbar variant="dense">
        <Button
          onClick={openAppIconMenu}
          sx={{
            lineHeight: "1em",
            margin: 0,
            display: { xs: "none", sm: "block" }
          }}
        >
          NODE
          <br />
          TOOL
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
              {/* <ExploreIcon /> */}
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

          <Tooltip
            title={
              <span
                style={{
                  color: "white",
                  textAlign: "center",
                  display: "block"
                }}
              >
                Open NodeMenu <br /> Ctrl+Space
              </span>
            }
            enterDelay={TOOLTIP_DELAY}
          >
            <Button
              className={`nav-button ${path === "/assets" ? "active" : ""}`}
              onClick={handleOpenNodeMenu}
            >
              {<AdjustIcon />}
              Nodes
            </Button>
          </Tooltip>
        </Box>

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
