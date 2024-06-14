/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

// store
import useWorkflowRunnner from "../../stores/WorkflowRunner";
// mui
import {
  AppBar,
  Button,
  Tooltip,
  Toolbar,
  Box,
  Typography
} from "@mui/material";
import PlayArrow from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
//hooks
import { useHotkeys } from "react-hotkeys-hook";
//constants
import { TOOLTIP_DELAY } from "../../config/constants";

const footerStyles = (theme: any) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      width: "40%",
      height: "80px",
      color: "#FCFCFC",
      backgroundColor: "transparent",
      bottom: "0",
      boxShadow: "none",
      border: 0,
      margin: "auto",
      position: "absolute",
      top: "auto",
      left: "0",
      right: "0",
      zIndex: 1200
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
      padding: "2em 3em",
      borderRadius: ".4em"
    },
    ".toolbar-buttons": {
      height: "2em",
      display: "flex",
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      borderRadius: "1em",
      gap: "2em"
    },
    button: {
      width: "3.0em",
      height: "3.0em",
      borderRadius: "0",
      color: theme.palette.c_white,
      "&:hover": {
        backgroundColor: theme.palette.c_gray1,
        color: theme.palette.c_hl1
      },
      "&.disabled:hover": {
        color: theme.palette.c_gray5
      },
      "&.active": {
        color: theme.palette.c_hl1
      }
    },
    "button svg": {
      width: "2.5em",
      height: "2.5em"
    },
    ".options": {
      marginLeft: "2em"
    },
    ".disabled": {
      opacity: 0.5,
      cursor: "default"
    }
  });

function AppFooter() {
  const runWorkflow = useWorkflowRunnner((state) => state.run);
  const cancelWorkflow = useWorkflowRunnner((state) => state.cancel);
  const state = useWorkflowRunnner((state) => state.state);
  const isWorkflowRunning = state === "running";
  useHotkeys("Control+Enter", () => runWorkflow());
  // useHotkeys("Escape", () => cancelWorkflow());

  return (
    <div css={footerStyles} onContextMenu={(e) => e.preventDefault()}>
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
                    CTRL+Enter
                  </span>
                </div>
              }
              enterDelay={TOOLTIP_DELAY}
            >
              <Button
                size="large"
                className={`run-workflow ${isWorkflowRunning ? "disabled" : ""
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
                size="large"
                className={`stop-workflow ${!isWorkflowRunning ? "disabled" : ""
                  }`}
                onClick={() => cancelWorkflow()}
              >
                <StopIcon />
              </Button>
            </Tooltip>
          </Box>

          {/* <LoadingAnimation /> */}
        </Toolbar>
      </AppBar>
    </div>
  );
}

export default AppFooter;
