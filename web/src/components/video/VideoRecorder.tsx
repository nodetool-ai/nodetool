/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { Box } from "@mui/material";
import { EditorButton, Text, LoadingSpinner } from "../ui_primitives";
import SettingsInputComponentIcon from "@mui/icons-material/SettingsInputComponent";
import {
  VideoRecorderProps,
  useVideoRecorder
} from "../../hooks/browser/useVideoRecorder";
import Select from "../inputs/Select";

const VideoRecorder = (props: VideoRecorderProps) => {
  const theme = useTheme();
  const {
    error,
    videoRef,
    handleRecord,
    isRecording,
    isPreviewing,
    isLoading,
    startPreview,
    stopStream,
    videoInputDevices,
    audioInputDevices,
    isDeviceListVisible,
    toggleDeviceListVisibility,
    selectedVideoDeviceId,
    selectedAudioDeviceId,
    handleVideoDeviceChange,
    handleAudioDeviceChange
  } = useVideoRecorder(props);

  const videoDeviceOptions = useMemo(() => {
    const options = videoInputDevices.map((device) => ({
      value: device.deviceId,
      label: device.label
    }));
    if (!options.some((option) => option.value === "")) {
      return [{ value: "", label: "System default camera" }, ...options];
    }
    return options;
  }, [videoInputDevices]);

  const audioDeviceOptions = useMemo(() => {
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
      ".video-preview": {
        width: "100%",
        maxHeight: "200px",
        backgroundColor: theme.vars.palette.grey[900],
        borderRadius: "var(--rounded-sm)",
        objectFit: "contain"
      },
      ".device-list": {
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
          borderRadius: "var(--rounded-sm)",
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
    <Box className="videorecorder" css={styles(theme)}>
      {!isPreviewing ? (
        <EditorButton
          onClick={startPreview}
          className="preview-button nodrag"
          variant="text"
          density="compact"
          disabled={isLoading}
        >
          START CAMERA
          {isLoading && <LoadingSpinner size="small" />}
        </EditorButton>
      ) : (
        <>
          <EditorButton
            onClick={handleRecord}
            className={`record-button nodrag ${isRecording ? " recording" : ""}`}
            variant="text"
            density="compact"
            disabled={isLoading}
          >
            {isRecording ? "STOP" : "RECORD"}
            {isLoading && <LoadingSpinner size="small" />}
          </EditorButton>
          {!isRecording && (
            <EditorButton
              onClick={stopStream}
              className="stop-button nodrag"
              variant="text"
              density="compact"
            >
              CLOSE
            </EditorButton>
          )}
        </>
      )}

      <EditorButton
        className="nodrag device-button"
        onClick={toggleDeviceListVisibility}
        variant="text"
        density="compact"
        aria-label="Toggle device list"
      >
        {isDeviceListVisible ? (
          <SettingsInputComponentIcon className="toggle-on" />
        ) : (
          <SettingsInputComponentIcon className="toggle-off" />
        )}
      </EditorButton>
      {error && <div className="error">{error}</div>}

      {isPreviewing && (
        <video
          ref={videoRef}
          className="video-preview"
          autoPlay
          playsInline
          muted
        />
      )}

      {isDeviceListVisible && (
        <div className="device-list" style={{ margin: "5px" }}>
          {videoInputDevices.length > 0 ? (
            <>
              <Text
                size="bigger"
                sx={{
                  fontSize: "var(--fontSizeSmaller)",
                  margin: "0 0 .5em 0",
                  color: "var(--palette-grey-100)"
                }}
              >
                Camera
              </Text>
              <div
                className={`device-select${
                  isRecording || isLoading ? " disabled" : ""
                }`}
              >
                <Select
                  options={videoDeviceOptions}
                  value={selectedVideoDeviceId}
                  onChange={handleVideoDeviceChange}
                  placeholder="System default camera"
                  label="Camera"
                  tabIndex={isRecording || isLoading ? -1 : 0}
                />
              </div>
            </>
          ) : (
            <Text
              size="small"
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
              No video input devices found.
            </Text>
          )}

          {audioInputDevices.length > 0 && (
            <>
              <Text
                size="bigger"
                sx={{
                  fontSize: "var(--fontSizeSmaller)",
                  margin: "1em 0 .5em 0",
                  color: "var(--palette-grey-100)"
                }}
              >
                Microphone
              </Text>
              <div
                className={`device-select${
                  isRecording || isLoading ? " disabled" : ""
                }`}
              >
                <Select
                  options={audioDeviceOptions}
                  value={selectedAudioDeviceId}
                  onChange={handleAudioDeviceChange}
                  placeholder="System default input"
                  label="Microphone"
                  tabIndex={isRecording || isLoading ? -1 : 0}
                />
              </div>
            </>
          )}
        </div>
      )}
    </Box>
  );
};

export default VideoRecorder;
