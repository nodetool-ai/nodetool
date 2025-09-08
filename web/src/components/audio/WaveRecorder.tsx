/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { Box, Button, CircularProgress, Typography } from "@mui/material";
import SettingsInputComponentIcon from "@mui/icons-material/SettingsInputComponent";
import {
  WaveRecorderProps,
  useWaveRecorder
} from "../../hooks/browser/useWaveRecorder";

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
    toggleDeviceListVisibility
  } = useWaveRecorder(props);

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
                Input Devices
              </Typography>
              <ul style={{ margin: 0, paddingLeft: "1.2em" }}>
                {audioInputDevices.map((deviceName, index) => (
                  <Typography
                    key={index}
                    component="li"
                    variant="body2"
                    sx={{ fontSize: "var(--fontSizeTiny)", lineHeight: "1.75" }}
                  >
                    {deviceName}
                  </Typography>
                ))}
              </ul>
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
