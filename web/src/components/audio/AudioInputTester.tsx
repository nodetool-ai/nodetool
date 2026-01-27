/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useMemo, useCallback } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Button, Typography, LinearProgress, IconButton } from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";
import StopIcon from "@mui/icons-material/Stop";
import RefreshIcon from "@mui/icons-material/Refresh";
import Select from "../inputs/Select";
import {
  useAudioInputTest,
  UseAudioInputTestResult
} from "../../hooks/browser/useAudioInputTest";

interface AudioInputTesterProps {
  /** If true, uses and syncs with the global default device from settings */
  useGlobalDefault?: boolean;
  /** Override to use an external hook instance */
  hookInstance?: UseAudioInputTestResult;
  /** Compact mode - smaller UI suitable for node properties */
  compact?: boolean;
  /** Label for the component */
  label?: string;
  /** Called when device changes */
  onDeviceChange?: (deviceId: string) => void;
}

const AudioInputTester = ({
  useGlobalDefault = false,
  hookInstance,
  compact = false,
  label = "Audio Input Device",
  onDeviceChange
}: AudioInputTesterProps) => {
  const theme = useTheme();

  // Use provided hook instance or create our own
  const ownHook = useAudioInputTest(useGlobalDefault);
  const {
    isTesting,
    startTest,
    stopTest,
    signalLevel,
    error,
    audioInputDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    refreshDevices,
    isLoadingDevices
  } = hookInstance || ownHook;

  const handleDeviceChange = useCallback(
    (deviceId: string) => {
      setSelectedDeviceId(deviceId);
      onDeviceChange?.(deviceId);
    },
    [setSelectedDeviceId, onDeviceChange]
  );

  const deviceOptions = useMemo(() => {
    const options = audioInputDevices.map((device) => ({
      value: device.deviceId,
      label: device.label
    }));
    // Add system default if not already present
    if (!options.some((option) => option.value === "")) {
      return [{ value: "", label: "System default input" }, ...options];
    }
    return options;
  }, [audioInputDevices]);

  const styles = (theme: Theme) =>
    css({
      display: "flex",
      flexDirection: "column",
      gap: compact ? "0.5em" : "1em",
      width: "100%",

      ".audio-input-tester-header": {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.5em"
      },

      ".audio-input-tester-label": {
        fontSize: compact ? theme.fontSizeSmall : theme.fontSizeNormal,
        fontWeight: 500,
        color: theme.vars.palette.grey[100]
      },

      ".device-selector-row": {
        display: "flex",
        alignItems: "center",
        gap: "0.5em"
      },

      ".device-select": {
        flex: 1,
        minWidth: compact ? "120px" : "180px",
        "& .select-container": {
          width: "100%"
        },
        "& .custom-select": {
          backgroundColor: theme.vars.palette.grey[700],
          color: theme.vars.palette.grey[100],
          borderRadius: "4px",
          border: `1px solid ${theme.vars.palette.grey[600]}`
        },
        "& .select-header": {
          padding: "0.4em 1.6em 0.4em 0.6em",
          fontSize: compact ? theme.fontSizeTiny : theme.fontSizeSmall
        }
      },

      ".test-button": {
        minWidth: compact ? "32px" : "80px",
        padding: compact ? "4px 8px" : "6px 16px",
        fontSize: compact ? theme.fontSizeTiny : theme.fontSizeSmall
      },

      ".refresh-button": {
        padding: "4px",
        minWidth: "auto"
      },

      ".signal-meter-container": {
        display: "flex",
        flexDirection: "column",
        gap: "0.25em"
      },

      ".signal-meter-label": {
        fontSize: theme.fontSizeTiny,
        color: theme.vars.palette.grey[300],
        display: "flex",
        alignItems: "center",
        gap: "0.5em"
      },

      ".signal-meter": {
        height: compact ? "6px" : "8px",
        borderRadius: "4px",
        backgroundColor: theme.vars.palette.grey[800],
        "& .MuiLinearProgress-bar": {
          backgroundColor:
            signalLevel > 0.6
              ? theme.vars.palette.success.main
              : signalLevel > 0.3
              ? theme.vars.palette.warning.main
              : theme.vars.palette.primary.main,
          transition: "transform 0.05s linear"
        }
      },

      ".error-message": {
        color: theme.vars.palette.error.main,
        fontSize: theme.fontSizeTiny,
        padding: "0.25em 0"
      }
    });

  return (
    <div className="audio-input-tester" css={styles(theme)}>
      <div className="audio-input-tester-header">
        <Typography className="audio-input-tester-label">{label}</Typography>
      </div>

      <div className="device-selector-row">
        <div className="device-select">
          <Select
            options={deviceOptions}
            value={selectedDeviceId}
            onChange={handleDeviceChange}
            placeholder="System default input"
            label={label}
            tabIndex={isTesting ? -1 : 0}
          />
        </div>

        <IconButton
          className="refresh-button"
          onClick={refreshDevices}
          disabled={isTesting || isLoadingDevices}
          size="small"
          title="Refresh devices"
        >
          <RefreshIcon fontSize="small" />
        </IconButton>

        <Button
          className="test-button"
          variant={isTesting ? "contained" : "outlined"}
          color={isTesting ? "error" : "primary"}
          size="small"
          onClick={isTesting ? stopTest : startTest}
          disabled={isLoadingDevices}
          startIcon={
            compact ? undefined : isTesting ? <StopIcon /> : <MicIcon />
          }
        >
          {compact ? (isTesting ? "Stop" : "Test") : isTesting ? "Stop" : "Test"}
        </Button>
      </div>

      {isTesting && (
        <div className="signal-meter-container">
          <Typography className="signal-meter-label">
            <MicIcon fontSize="inherit" />
            Signal Level: {Math.round(signalLevel * 100)}%
          </Typography>
          <LinearProgress
            className="signal-meter"
            variant="determinate"
            value={signalLevel * 100}
          />
        </div>
      )}

      {error && <Typography className="error-message">{error}</Typography>}

      {audioInputDevices.length === 0 && !isLoadingDevices && !error && (
        <Typography className="error-message">
          No audio input devices found. Please connect a microphone and click
          refresh.
        </Typography>
      )}
    </div>
  );
};

export default AudioInputTester;
