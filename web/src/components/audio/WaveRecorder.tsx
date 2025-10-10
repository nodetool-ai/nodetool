/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  Box,
  Button,
  CircularProgress,
  Typography
} from "@mui/material";
import SettingsInputComponentIcon from "@mui/icons-material/SettingsInputComponent";
import {
  WaveRecorderProps,
  useWaveRecorder
} from "../../hooks/browser/useWaveRecorder";
import Select from "../inputs/Select";

const WaveRecorder = (props: WaveRecorderProps) => {
  const theme = useTheme();
  const {
    error,
    micRef,
    handleRecord,
    isRecording,
    isLoading,
    audioInputDevices,
    isDeviceListVisible,
    toggleDeviceListVisibility,
    selectedInputDeviceId,
    handleInputDeviceChange
  } = useWaveRecorder(props);

  const deviceOptions = useMemo(() => {
    const options = audioInputDevices.map((device) => ({
      value: device.deviceId,
      label: device.label
    }));
    if (!options.some((option) => option.value === "")) {
      return [{ value: "", label: "System default input" }, ...options];
    }
    return options;
  }, [audioInputDevices]);

  const styles = (theme: Theme) =>
    css({
      background: theme.vars.palette.grey[800],
      minHeight: "50px",
      marginTop: "0.5em",
      "& button": {
        fontSize: theme.fontSizeSmall,
        border: "0",
        padding: "2px",
        margin: ".5em",
        color: "var(--palette-primary-main)"
      },
      "& button.device-button": {
        float: "right",
        marginTop: "0.3em"
      },
      "& button.play-pause-button": {
        minWidth: "4em"
      },
      ".audio-device-list": {
        position: "relative",
        maxWidth: "200px",
        fontSize: theme.fontSizeTiny,
        color: theme.vars.palette.grey[200]
      },
      ".device-select": {
        marginTop: "0.5em",
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
          padding: "0.4em 1.6em 0.4em 0.6em"
        },
        "&.disabled": {
          opacity: 0.5,
          pointerEvents: "none"
        }
      },
      "& .toggle-on": {
        width: "10px",
        height: "10px",
        opacity: "1"
      },
      "& .toggle-off": {
        width: "10px",
        height: "10px",
        opacity: "0.6"
      },
      "& button.recording": {
        backgroundColor: theme.vars.palette.error.main,
        marginLeft: "0.5em",
        color: theme.vars.palette.grey[900],
        minWidth: "33px"
      },
      "& .error": {
        color: theme.vars.palette.error.main,
        fontSize: theme.fontSizeTiny,
        lineHeight: "1.1em"
      }
    });

  return (
    <Box className="waverecorder" css={styles(theme)}>
      <Button
        onClick={handleRecord}
        className={`record-button nodrag ${isRecording ? " recording" : ""}`}
        variant="text"
        size="small"
        disabled={isLoading}
      >
        {isRecording ? "STOP" : "RECORD"}
        {isLoading && <CircularProgress size={6} />}
      </Button>

      <Button
        className="nodrag device-button"
        onClick={toggleDeviceListVisibility}
        variant="text"
        size="small"
      >
        {isDeviceListVisible ? (
          <SettingsInputComponentIcon className="toggle-on" />
        ) : (
          <SettingsInputComponentIcon className="toggle-off" />
        )}
      </Button>
      {error && <div className="error">{error}</div>}

      {isDeviceListVisible && (
        <div className="audio-device-list" style={{ margin: "5px" }}>
          {audioInputDevices.length > 0 ? (
            <>
              <Typography
                variant="h2"
                sx={{
                  fontSize: "var(--fontSizeSmaller)",
                  margin: "0 0 .5em 0",
                  color: "var(--palette-grey-100)"
                }}
              >
                Input Device
              </Typography>
              <div
                className={`device-select${
                  isRecording || isLoading ? " disabled" : ""
                }`}
              >
                <Select
                  options={deviceOptions}
                  value={selectedInputDeviceId}
                  onChange={handleInputDeviceChange}
                  placeholder="System default input"
                  label="Input Device"
                  tabIndex={isRecording || isLoading ? -1 : 0}
                />
              </div>
            </>
          ) : (
            <Typography
              variant="body2"
              sx={{
                fontSize: "var(--fontSizeSmall)",
                position: "absolute",
                backgroundColor: "var(--palette-warning-main)",
                color: "var(--palette-grey-900)",
                padding: ".2em 0.5em",
                borderRadius: "0.2em",
                zIndex: 100,
                top: "0.5em",
                left: "0.5em"
              }}
            >
              No audio input devices found.
            </Typography>
          )}
        </div>
      )}

      <div ref={micRef}></div>
    </Box>
  );
};

export default WaveRecorder;
