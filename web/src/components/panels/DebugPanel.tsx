/** @jsxImportSource @emotion/react */
import { Button, Tooltip, Box } from "@mui/material";
import PlayArrow from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import StopIcon from "@mui/icons-material/Stop";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import SkipForwardIcon from "@mui/icons-material/PlayArrow";
import SettingsIcon from "@mui/icons-material/Settings";
import ClearIcon from "@mui/icons-material/ClearAll";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback } from "react";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
import { useCombo } from "../../stores/KeyPressedStore";

const styles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      alignItems: "center",
      gap: "4px",
      padding: "4px 8px",
      backgroundColor: `${theme.vars.palette.grey[800]}cc`,
      borderRadius: "8px",
      border: `1px solid ${theme.vars.palette.grey[600]}`,
    },
    ".debug-button": {
      width: "28px",
      height: "28px",
      minWidth: "28px",
      padding: "2px",
      color: theme.vars.palette.grey[200],
      borderRadius: "4px",
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[600],
      },
      "& svg": {
        fontSize: "18px",
      },
    },
    ".debug-button.active": {
      backgroundColor: `${theme.vars.palette.primary.main}40`,
      color: "var(--palette-primary-main)",
    },
    ".debug-button.running": {
      color: "var(--palette-primary-main)",
    },
    ".separator": {
      width: "1px",
      height: "20px",
      backgroundColor: theme.vars.palette.grey[600],
      margin: "0 4px",
    },
    ".status-text": {
      fontSize: "11px",
      color: theme.vars.palette.grey[300],
      marginLeft: "4px",
      maxWidth: "120px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    ".breakpoint-count": {
      fontSize: "10px",
      color: theme.vars.palette.warning.main,
      marginLeft: "4px",
    },
  });

interface DebugPanelProps {
  onToggleBreakpoints?: () => void;
}

const DebugPanel: React.FC<DebugPanelProps> = ({ onToggleBreakpoints: _onToggleBreakpoints }) => {
  const theme = useTheme();

  const {
    state,
    isDebugging,
    currentNodeId,
    breakpoints,
    pause,
    resume,
    cancel,
    stepOver,
    stepInto,
    clearBreakpoints,
    setDebugMode
  } = useWebsocketRunner((s) => ({
    state: s.state,
    isDebugging: s.state === "debugging" || s.state === "paused",
    currentNodeId: s.currentNodeId,
    breakpoints: s.breakpoints,
    pause: s.pause,
    resume: s.resume,
    cancel: s.cancel,
    stepOver: s.stepOver,
    stepInto: s.stepInto,
    toggleBreakpoint: s.toggleBreakpoint,
    clearBreakpoints: s.clearBreakpoints,
    setDebugMode: s.setDebugMode
  }));

  const isRunning = state === "running" || state === "debugging" || state === "paused";
  const isIdle = state === "idle";

  const handleToggleDebugMode = useCallback(async () => {
    if (isDebugging) {
      await setDebugMode(false);
    } else {
      await setDebugMode(true);
    }
  }, [isDebugging, setDebugMode]);

  const handleStepOver = useCallback(async () => {
    await stepOver();
  }, [stepOver]);

  const handleStepInto = useCallback(async () => {
    await stepInto();
  }, [stepInto]);

  const handlePause = useCallback(async () => {
    if (state === "running") {
      await pause();
    }
  }, [state, pause]);

  const handleResume = useCallback(async () => {
    if (state === "paused") {
      await resume();
    }
  }, [state, resume]);

  const handleStop = useCallback(async () => {
    await cancel();
    await setDebugMode(false);
  }, [cancel, setDebugMode]);

  const handleClearBreakpoints = useCallback(() => {
    clearBreakpoints();
  }, [clearBreakpoints]);

  // Keyboard shortcuts for debugging
  useCombo(["control", "backslash"], handleToggleDebugMode, true, !isRunning);
  useCombo(["f5"], state === "paused" ? handleResume : handlePause, true, !isRunning);
  useCombo(["f10"], handleStepOver, true, !isDebugging);
  useCombo(["f11"], handleStepInto, true, !isDebugging);
  useCombo(["shift", "f11"], handleStepOver, true, !isDebugging);

  return (
    <Box css={styles(theme)}>
      <Tooltip
        title={isDebugging ? "Disable Debug Mode (Ctrl+\\)" : "Enable Debug Mode (Ctrl+\\)"}
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <Button
          className={`debug-button ${isDebugging ? "active" : ""}`}
          onClick={handleToggleDebugMode}
          disabled={isIdle}
          tabIndex={-1}
        >
          <SettingsIcon />
        </Button>
      </Tooltip>

      {isDebugging && (
        <>
          <div className="separator" />

          <Tooltip title="Step Over (F10)" enterDelay={TOOLTIP_ENTER_DELAY}>
            <Button
              className="debug-button"
              onClick={handleStepOver}
              disabled={state !== "paused"}
              tabIndex={-1}
            >
              <SkipNextIcon />
            </Button>
          </Tooltip>

          <Tooltip title="Step Into (F11)" enterDelay={TOOLTIP_ENTER_DELAY}>
            <Button
              className="debug-button"
              onClick={handleStepInto}
              disabled={state !== "paused"}
              tabIndex={-1}
            >
              <SkipForwardIcon />
            </Button>
          </Tooltip>

          {state === "paused" ? (
            <Tooltip title="Resume (F5)" enterDelay={TOOLTIP_ENTER_DELAY}>
              <Button
                className="debug-button running"
                onClick={handleResume}
                tabIndex={-1}
              >
                <PlayArrow />
              </Button>
            </Tooltip>
          ) : (
            <Tooltip title="Pause (F5)" enterDelay={TOOLTIP_ENTER_DELAY}>
              <Button
                className="debug-button"
                onClick={handlePause}
                tabIndex={-1}
              >
                <PauseIcon />
              </Button>
            </Tooltip>
          )}

          <Tooltip title="Stop" enterDelay={TOOLTIP_ENTER_DELAY}>
            <Button
              className="debug-button"
              onClick={handleStop}
              tabIndex={-1}
            >
              <StopIcon />
            </Button>
          </Tooltip>

          <div className="separator" />

          <Tooltip title="Clear All Breakpoints" enterDelay={TOOLTIP_ENTER_DELAY}>
            <Button
              className="debug-button"
              onClick={handleClearBreakpoints}
              disabled={breakpoints.size === 0}
              tabIndex={-1}
            >
              <ClearIcon />
            </Button>
          </Tooltip>

          {breakpoints.size > 0 && (
            <span className="breakpoint-count">
              {breakpoints.size} breakpoint{breakpoints.size !== 1 ? "s" : ""}
            </span>
          )}

          {currentNodeId && (
            <span className="status-text">
              Current: {currentNodeId}
            </span>
          )}
        </>
      )}

      {!isDebugging && isRunning && (
        <>
          <div className="separator" />
          <span className="status-text">Running...</span>
        </>
      )}
    </Box>
  );
};

export default memo(DebugPanel);
