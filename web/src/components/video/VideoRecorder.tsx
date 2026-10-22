/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  EditorButton,
  Text,
  LoadingSpinner,
  Box,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx,
  Z_INDEX
} from "../ui_primitives";
import SettingsInputComponentIcon from "@mui/icons-material/SettingsInputComponent";
import {
  VideoRecorderProps,
  useVideoRecorder
} from "../../hooks/browser/useVideoRecorder";
import Select from "../inputs/Select";

interface VideoRecorderViewProps extends VideoRecorderProps {
  /**
   * Render nothing when the machine reports no camera. A drop zone offers the
   * camera as a second way in, so on a machine without one it should not
   * show a control that can only fail.
   */
  hideWhenUnavailable?: boolean;
}

const VideoRecorder = ({
  hideWhenUnavailable = false,
  ...props
}: VideoRecorderViewProps) => {
  const { t } = useTranslation();
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
      return [
        { value: "", label: t("screen_timeline.video.systemDefaultCamera") },
        ...options
      ];
    }
    return options;
  }, [videoInputDevices]);

  const audioDeviceOptions = useMemo(() => {
    const options = audioInputDevices.map((device) => ({
      value: device.deviceId,
      label: device.label
    }));
    if (!options.some((option) => option.value === "")) {
      return [
        { value: "", label: t("screen_timeline.video.systemDefaultInput") },
        ...options
      ];
    }
    return options;
  }, [audioInputDevices]);

  const styles = (theme: Theme) =>
    css({
      background: theme.vars.palette.background.paper,
      minHeight: "50px",
      marginTop: getSpacingPx(SPACING.md),
      "& button": {
        fontSize: theme.fontSizeSmall,
        border: "0",
        padding: getSpacingPx(SPACING.micro),
        margin: getSpacingPx(SPACING.md),
        color: "var(--palette-primary-main)"
      },
      "& button.device-button": {
        float: "right",
        marginTop: getSpacingPx(SPACING.xs)
      },
      "& button.play-pause-button": {
        minWidth: "4em"
      },
      ".video-preview": {
        width: "100%",
        maxHeight: "200px",
        backgroundColor: theme.vars.palette.background.default,
        borderRadius: BORDER_RADIUS.sm,
        objectFit: "contain"
      },
      ".device-list": {
        position: "relative",
        maxWidth: "200px",
        fontSize: theme.fontSizeSmaller,
        color: theme.vars.palette.grey[200]
      },
      ".device-select": {
        marginTop: getSpacingPx(SPACING.md),
        "& .select-container": {
          width: "100%"
        },
        "& .custom-select": {
          backgroundColor: theme.vars.palette.action.selected,
          color: theme.vars.palette.grey[100],
          borderRadius: BORDER_RADIUS.sm,
          border: `1px solid ${theme.vars.palette.grey[600]}`
        },
        "& .select-header": {
          padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.xxl)} ${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.md)}`
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
        marginLeft: getSpacingPx(SPACING.md),
        color: theme.vars.palette.grey[900],
        minWidth: "33px"
      },
      "& .error": {
        color: theme.vars.palette.error.main,
        fontSize: theme.fontSizeSmaller,
        lineHeight: "1.1em"
      }
    });

  if (hideWhenUnavailable && videoInputDevices.length === 0 && !isPreviewing) {
    return null;
  }

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
          {t("screen_timeline.video.startCamera")}
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
            {isRecording
              ? t("screen_timeline.video.stop")
              : t("screen_timeline.video.record")}
            {isLoading && <LoadingSpinner size="small" />}
          </EditorButton>
          {!isRecording && (
            <EditorButton
              onClick={stopStream}
              className="stop-button nodrag"
              variant="text"
              density="compact"
            >
              {t("screen_timeline.video.close")}
            </EditorButton>
          )}
        </>
      )}

      <EditorButton
        className="nodrag device-button"
        onClick={toggleDeviceListVisibility}
        variant="text"
        density="compact"
        aria-label={t("screen_timeline.video.toggleDeviceList")}
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
          aria-label={t("screen_timeline.video.cameraPreview")}
          autoPlay
          playsInline
          muted
        />
      )}

      {isDeviceListVisible && (
        <div className="device-list" style={{ margin: theme.spacing(1.5) }}>
          {videoInputDevices.length > 0 ? (
            <>
              <Text
                size="smaller"
                weight={600}
                sx={{
                  margin: `0 0 ${getSpacingPx(SPACING.md)} 0`,
                  color: "var(--palette-grey-100)"
                }}
              >
                {t("screen_timeline.video.camera")}
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
                  placeholder={t("screen_timeline.video.systemDefaultCamera")}
                  label={t("screen_timeline.video.camera")}
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
                padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.md)}`,
                borderRadius: BORDER_RADIUS.xs,
                zIndex: Z_INDEX.overlay,
                top: "0.5em",
                left: "0.5em"
              }}
            >
              {t("screen_timeline.video.noVideoDevices")}
            </Text>
          )}

          {audioInputDevices.length > 0 && (
            <>
              <Text
                size="smaller"
                weight={600}
                sx={{
                  margin: `${getSpacingPx(SPACING.xl)} 0 ${getSpacingPx(SPACING.md)} 0`,
                  color: "var(--palette-grey-100)"
                }}
              >
                {t("screen_timeline.video.microphone")}
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
                  placeholder={t("screen_timeline.video.systemDefaultInput")}
                  label={t("screen_timeline.video.microphone")}
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
