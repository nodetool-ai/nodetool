/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Button, CircularProgress, Snackbar, Typography } from "@mui/material";
import SettingsInputComponentIcon from "@mui/icons-material/SettingsInputComponent";
import {
  WaveRecorderProps,
  useWaveRecorder
} from "../../hooks/browser/useWaveRecorder";

const WaveRecorder = (props: WaveRecorderProps) => {
  const {
    error,
    setError,
    micRef,
    handleRecord,
    isRecording,
    isLoading,
    audioDeviceNames,
    isDeviceListVisible,
    toggleDeviceListVisibility
  } = useWaveRecorder(props);

  const styles = (theme: any) =>
    css({
      background: theme.palette.c_gray1,
      minHeight: "50px",
      marginTop: "0.5em",
      "& button": {
        fontSize: theme.fontSizeSmall,
        border: "0",
        padding: "2px",
        margin: "2px",
        color: theme.palette.c_hl1
      },
      "& button.device-button": {
        float: "right",
        marginTop: "0.3em"
      },
      "& button.play-pause-button": {
        minWidth: "4em"
      },
      ".audio-device-list": {
        maxWidth: "200px",
        fontSize: theme.fontSizeTiny,
        color: theme.palette.c_gray5
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
        backgroundColor: theme.palette.c_error,
        color: theme.palette.c_gray0,
        minWidth: "33px"
      },
      "& .error": {
        color: theme.palette.c_error,
        fontSize: theme.fontSizeTiny,
        lineHeight: "1.1em"
      }
    });

  return (
    <div className="waverecorder" css={styles}>
      {/* <Snackbar
        open={error !== null}
        className="nodrag"
        autoHideDuration={30000}
        anchorOrigin={{ vertical: "top", horizontal: "left" }}
        sx={{
          top: "20px",
          left: "-50px"
        }}
        onClose={() => setError(null)}
        message={
          <>
            <span style={{ color: "#ff5555", display: "block" }}>
              CHECK RECORDING DEVICE{" "}
            </span>
            <span>{error}</span>
          </>
        }
      /> */}

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
        <div className="audio-device-list" style={{ marginLeft: "5px" }}>
          {audioDeviceNames.length > 0 ? (
            audioDeviceNames.map((deviceName, index) => (
              <Typography variant="body2" key={index}>
                {deviceName}
              </Typography>
            ))
          ) : (
            <Typography variant="body2">No devices found.</Typography>
          )}
        </div>
      )}

      <div ref={micRef}></div>
    </div>
  );
};

export default WaveRecorder;
