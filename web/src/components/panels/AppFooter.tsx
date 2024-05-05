/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useState } from "react";
// import { useReactFlow } from "reactflow";
// store
import useWorkflowRunnner from "../../stores/WorkflowRunner";

// components
// import LoadingAnimation from "../node_editor/LoadingAnimation";
// import SettingsMenu from "../menus/SettingsMenu";
// import Help from "../content/Help/Help";
// import Alert from "../node_editor/Alert";
// import WorkflowMenu from "../workflows/WorkflowMenu";
// import AppIconMenu from "../menus/AppIconMenu";
import BarChartIcon from "@mui/icons-material/BarChart";
import CampaignIcon from "@mui/icons-material/Campaign";
// mui
import {
  AppBar,
  Button,
  Tooltip,
  Toolbar,
  Box,
  Typography,
  Popover
} from "@mui/material";
import PlayArrow from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
// import QueryStatsIcon from "@mui/icons-material/QueryStats";

//utils
import useKeyListener from "../../utils/KeyListener";
//constants
import { TOOLTIP_DELAY } from "../../config/constants";
import WorkflowStats from "../workflows/WorkflowStats";

const footerStyles = (theme: any) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      width: "40%",
      height: "50px",
      color: "#FCFCFC",
      backgroundColor: "transparent",
      bottom: "5px",
      boxShadow: "none",
      border: 0,
      left: "0",
      margin: "auto",
      position: "absolute",
      right: "0",
      top: "auto",
      zIndex: 100
    },
    header: {
      width: "100%",
      display: "flex",
      flexDirection: "row",
      justifyContent: "center",
      background: "transparent",
      boxShadow: "none"
    },
    ".toolbar": {
      borderRadius: ".4em"
    },
    ".toolbar-buttons": {
      display: "flex",
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      borderRadius: "1em",
      top: "-10px"
    },
    button: {
      color: theme.palette.c_white,
      "&:hover": {
        backgroundColor: theme.palette.c_gray2
      },
      "&.active": {
        color: theme.palette.c_hl1
      }
    },
    "button svg": {
      marginRight: "0.1em",
      width: "1.5em",
      height: "1.5em"
    },
    ".status-message": {
      position: "fixed",
      top: "0.5em",
      maxWidth: "50%",
      left: "0",
      right: "0",
      margin: "auto",
      minWidth: "50%",
      textAlign: "center",
      padding: "0.3em 1em",
      color: theme.palette.c_gray5,
      backgroundColor: "transparent",
      transform: "translateX(0%)"
    },
    ".options": {
      marginLeft: "2em"
    },
    ".run-workflow.disabled": {
      opacity: 0.5,
      cursor: "default"
    }
  });

function AppFooter() {
  const runWorkflow = useWorkflowRunnner((state) => state.run);
  const cancelWorkflow = useWorkflowRunnner((state) => state.cancel);
  const state = useWorkflowRunnner((state) => state.state);
  const isWorkflowRunning = state === "running";
  const statusMessage = useWorkflowRunnner((state) => state.statusMessage);
  const [areMessagesVisible, setAreMessagesVisible] = useState(true);
  const [isWorkflowStatsVisible, setIsWorkflowStatsVisible] = useState(false);

  useKeyListener("Alt+Enter", () => runWorkflow());
  useKeyListener("Meta+Enter", () => runWorkflow());
  useKeyListener("Escape", () => cancelWorkflow());

  function toggleWorkflowStats(): void {
    setIsWorkflowStatsVisible(!isWorkflowStatsVisible);
  }

  function toggleMessages(): void {
    setAreMessagesVisible(!areMessagesVisible);
  }

  function handleWorkflowStatsClose(): void {
    setIsWorkflowStatsVisible(false);
  }

  return (
    <div css={footerStyles}>
      <Popover
        open={isWorkflowStatsVisible}
        onClose={handleWorkflowStatsClose}
        anchorReference="none"
        style={{
          position: "absolute",
          width: "100%",
          height: "90%",
          boxShadow: "none",
          top: "0",
          left: "0",
          margin: "auto",
          background: "transparent"
          // transform: "translate(-50%, -50%)"
        }}
      >
        <WorkflowStats />
      </Popover>
      <AppBar position="static" className="app-footer">
        <Toolbar className="toolbar" variant="dense">
          <Box className="toolbar-buttons">
            <Tooltip
              title={
                <div
                  className="tooltip-span"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "0.1em"
                  }}
                >
                  <span style={{ fontSize: "1.2em", color: "white" }}>
                    Run Workflow
                  </span>
                  <span style={{ fontSize: ".9em", color: "white" }}>
                    ALT+Enter | Meta+Enter
                  </span>
                </div>
              }
              enterDelay={TOOLTIP_DELAY}
            >
              <Button
                className={`run-workflow ${
                  isWorkflowRunning ? "disabled" : ""
                }`}
                onClick={() => !isWorkflowRunning && runWorkflow()}
              >
                <PlayArrow />
              </Button>
            </Tooltip>
            <Tooltip
              title={
                <div
                  className="tooltip-span"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "0.1em"
                  }}
                >
                  <span style={{ fontSize: "1.2em", color: "white" }}>
                    Stop Workflow
                  </span>
                  <span style={{ fontSize: "1em", color: "white" }}>ESC</span>
                </div>
              }
              enterDelay={TOOLTIP_DELAY}
            >
              <Button
                className="stop-workflow"
                onClick={() => cancelWorkflow()}
              >
                <StopIcon />
              </Button>
            </Tooltip>
          </Box>

          <Box className="toolbar-buttons options">
            <Tooltip title="Show Messages" enterDelay={TOOLTIP_DELAY}>
              <Button
                className={`show-messages ${
                  areMessagesVisible ? "active" : ""
                }`}
                onClick={() => toggleMessages()}
              >
                <CampaignIcon />
              </Button>
            </Tooltip>

            <Tooltip title="Open Workflow Stats" enterDelay={TOOLTIP_DELAY}>
              <Button
                className={`show-info ${
                  isWorkflowStatsVisible ? "active" : ""
                }`}
                onClick={() => toggleWorkflowStats()}
              >
                <BarChartIcon />
              </Button>
            </Tooltip>
          </Box>

          {/* <LoadingAnimation /> */}
        </Toolbar>
      </AppBar>
      {areMessagesVisible && state !== "idle" && (
        <Box className="status-message ">
          <Typography variant="caption" color="inherit">
            {statusMessage || ""}
          </Typography>
        </Box>
      )}
    </div>
  );
}

export default AppFooter;
