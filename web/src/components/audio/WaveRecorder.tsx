/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  Box,
  Button,
  CircularProgress,
  Typography,
  LinearProgress,
  Tooltip
} from "@mui/material";
import SettingsInputComponentIcon from "@mui/icons-material/SettingsInputComponent";
import MicIcon from "@mui/icons-material/Mic";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import StopIcon from "@mui/icons-material/Stop";
import {
  WaveRecorderProps,
  useWaveRecorder
} from "../../hooks/browser/useWaveRecorder";
import Select from "../inputs/Select";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import {
  formatTime,
  createAudioContext,
  createConfiguredAnalyser,
  calculateSignalLevel
} from "../../utils/audioUtils";

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

  // Recording time state
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Signal test state
  const [isTesting, setIsTesting] = useState(false);
  const [signalLevel, setSignalLevel] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Recording timer effect
  useEffect(() => {
    if (isRecording) {
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      setRecordingTime(0);
    }

    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, [isRecording]);

  const stopTest = useCallback(() => {
    setIsTesting(false);
    setSignalLevel(0);

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {
        // noop
      }
      audioContextRef.current = null;
    }

    analyserRef.current = null;
  }, []);

  const startTest = useCallback(() => {
    stopTest();
    setIsTesting(true);

    const audioConstraints: MediaTrackConstraints = selectedInputDeviceId
      ? { deviceId: { exact: selectedInputDeviceId } }
      : {};

    navigator.mediaDevices
      .getUserMedia({ audio: audioConstraints })
      .then((stream) => {
        streamRef.current = stream;

        const audioContext = createAudioContext();
        audioContextRef.current = audioContext;

        const analyser = createConfiguredAnalyser(audioContext);
        analyserRef.current = analyser;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const updateLevel = () => {
          if (!analyserRef.current) {
            return;
          }
          analyserRef.current.getByteFrequencyData(dataArray);
          const normalizedLevel = calculateSignalLevel(dataArray);
          setSignalLevel(normalizedLevel);
          animationFrameRef.current = requestAnimationFrame(updateLevel);
        };

        animationFrameRef.current = requestAnimationFrame(updateLevel);
      })
      .catch(() => {
        setIsTesting(false);
      });
  }, [selectedInputDeviceId, stopTest]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTest();
    };
  }, [stopTest]);

  // Stop test when recording starts
  useEffect(() => {
    if (isRecording && isTesting) {
      stopTest();
    }
  }, [isRecording, isTesting, stopTest]);

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
      borderRadius: "4px",
      padding: "0.25em",

      ".button-row": {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.5em"
      },

      ".record-button": {
        display: "flex",
        alignItems: "center",
        gap: "0.35em",
        fontSize: theme.fontSizeSmall,
        fontWeight: 600,
        padding: "0.4em 0.8em",
        borderRadius: "4px",
        transition: "all 0.2s ease",
        textTransform: "uppercase",
        letterSpacing: "0.5px",

        "&:not(.recording)": {
          color: theme.vars.palette.grey[100],
          backgroundColor: theme.vars.palette.grey[700],
          border: `1px solid ${theme.vars.palette.grey[600]}`,
          "&:hover": {
            backgroundColor: theme.vars.palette.grey[600],
            borderColor: theme.vars.palette.primary.main
          }
        },

        "&.recording": {
          backgroundColor: theme.vars.palette.error.main,
          color: theme.vars.palette.error.contrastText,
          border: `1px solid ${theme.vars.palette.error.dark}`,
          animation: "pulse 1.5s ease-in-out infinite",
          "&:hover": {
            backgroundColor: theme.vars.palette.error.dark
          }
        },

        "& .record-icon": {
          fontSize: "12px"
        },

        "& .stop-icon": {
          fontSize: "14px"
        }
      },

      "@keyframes pulse": {
        "0%, 100%": {
          opacity: 1
        },
        "50%": {
          opacity: 0.85
        }
      },

      ".recording-time": {
        display: "flex",
        alignItems: "center",
        gap: "0.35em",
        fontSize: theme.fontSizeSmall,
        fontWeight: 500,
        color: theme.vars.palette.error.main,
        fontFamily: "monospace",
        minWidth: "50px"
      },

      ".recording-dot": {
        fontSize: "8px",
        animation: "blink 1s ease-in-out infinite"
      },

      "@keyframes blink": {
        "0%, 100%": {
          opacity: 1
        },
        "50%": {
          opacity: 0.3
        }
      },

      ".device-button": {
        minWidth: "36px",
        width: "36px",
        height: "36px",
        padding: "6px",
        borderRadius: "4px",
        backgroundColor: theme.vars.palette.grey[700],
        border: `1px solid ${theme.vars.palette.grey[600]}`,
        color: theme.vars.palette.grey[300],
        transition: "all 0.2s ease",

        "&:hover": {
          backgroundColor: theme.vars.palette.grey[600],
          color: theme.vars.palette.primary.main,
          borderColor: theme.vars.palette.primary.main
        },

        "&.active": {
          backgroundColor: theme.vars.palette.grey[600],
          color: theme.vars.palette.primary.main,
          borderColor: theme.vars.palette.primary.main
        },

        "& svg": {
          fontSize: "18px"
        }
      },

      ".audio-device-list": {
        position: "relative",
        maxWidth: "220px",
        fontSize: theme.fontSizeTiny,
        color: theme.vars.palette.grey[200],
        marginTop: "0.5em",
        padding: "0.5em",
        backgroundColor: theme.vars.palette.grey[900],
        borderRadius: "4px",
        border: `1px solid ${theme.vars.palette.grey[700]}`
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

      "& .error": {
        color: theme.vars.palette.error.main,
        fontSize: theme.fontSizeTiny,
        lineHeight: "1.1em",
        padding: "0.25em 0.5em",
        marginTop: "0.25em"
      },

      ".signal-test-container": {
        marginTop: "0.75em",
        padding: "0.5em",
        backgroundColor: theme.vars.palette.grey[800],
        borderRadius: "4px",
        border: `1px solid ${theme.vars.palette.grey[700]}`
      },

      ".test-button": {
        fontSize: theme.fontSizeTiny,
        fontWeight: 500,
        padding: "0.3em 0.6em",
        borderRadius: "3px",
        textTransform: "uppercase",
        letterSpacing: "0.3px",
        transition: "all 0.2s ease",

        "&:not(.testing)": {
          color: theme.vars.palette.grey[200],
          backgroundColor: theme.vars.palette.grey[700],
          border: `1px solid ${theme.vars.palette.grey[600]}`,
          "&:hover": {
            backgroundColor: theme.vars.palette.grey[600],
            borderColor: theme.vars.palette.warning.main
          }
        },

        "&.testing": {
          backgroundColor: theme.vars.palette.warning.main,
          color: theme.vars.palette.warning.contrastText,
          border: `1px solid ${theme.vars.palette.warning.dark}`,
          "&:hover": {
            backgroundColor: theme.vars.palette.warning.dark
          }
        }
      },

      ".signal-test-row": {
        display: "flex",
        alignItems: "center",
        gap: "0.5em",
        marginBottom: "0.25em"
      },

      ".signal-label": {
        fontSize: theme.fontSizeTiny,
        color: theme.vars.palette.grey[300],
        display: "flex",
        alignItems: "center",
        gap: "0.25em",
        marginTop: "0.5em",
        marginBottom: "0.25em"
      },

      ".signal-meter": {
        height: "6px",
        borderRadius: "3px",
        backgroundColor: theme.vars.palette.grey[700],
        "& .MuiLinearProgress-bar": {
          transition: "transform 0.05s linear"
        }
      }
    });

  return (
    <Box className="waverecorder" css={styles(theme)}>
      <div className="button-row">
        <Tooltip
          title={isRecording ? "Stop Recording" : "Start Recording"}
          enterDelay={TOOLTIP_ENTER_DELAY}
        >
          <span>
            <Button
              onClick={handleRecord}
              className={`record-button nodrag ${isRecording ? "recording" : ""}`}
              variant="text"
              size="small"
              disabled={isLoading}
            >
              {isRecording ? (
                <>
                  <StopIcon className="stop-icon" />
                  Stop Recording
                </>
              ) : (
                <>
                  <FiberManualRecordIcon className="record-icon" />
                  Record
                </>
              )}
              {isLoading && <CircularProgress size={10} sx={{ ml: 0.5 }} />}
            </Button>
          </span>
        </Tooltip>

        {isRecording && (
          <div className="recording-time">
            <FiberManualRecordIcon className="recording-dot" />
            {formatTime(recordingTime)}
          </div>
        )}

        <Tooltip
          title={
            isDeviceListVisible
              ? "Hide Device Settings"
              : "Show Device Settings"
          }
          enterDelay={TOOLTIP_ENTER_DELAY}
        >
          <Button
            className={`nodrag device-button ${isDeviceListVisible ? "active" : ""}`}
            onClick={toggleDeviceListVisibility}
            variant="text"
            size="small"
          >
            <SettingsInputComponentIcon />
          </Button>
        </Tooltip>
      </div>

      {error && <div className="error">{error}</div>}

      {isDeviceListVisible && (
        <div className="audio-device-list">
          {audioInputDevices.length > 0 ? (
            <>
              <Typography
                variant="h2"
                sx={{
                  fontSize: "var(--fontSizeSmaller)",
                  margin: "0 0 .5em 0",
                  color: "var(--palette-grey-100)",
                  fontWeight: 500
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
              <div className="signal-test-container">
                <div className="signal-test-row">
                  <Tooltip
                    title={
                      isTesting
                        ? "Stop testing microphone"
                        : "Test microphone signal level"
                    }
                    enterDelay={TOOLTIP_ENTER_DELAY}
                  >
                    <span>
                      <Button
                        onClick={isTesting ? stopTest : startTest}
                        className={`test-button nodrag ${isTesting ? "testing" : ""}`}
                        variant="text"
                        size="small"
                        disabled={isRecording || isLoading}
                      >
                        {isTesting ? "Stop Test" : "Test Input"}
                      </Button>
                    </span>
                  </Tooltip>
                </div>
                {isTesting && (
                  <>
                    <Typography className="signal-label">
                      <MicIcon sx={{ fontSize: "10px" }} />
                      Signal: {Math.round(signalLevel * 100)}%
                    </Typography>
                    <LinearProgress
                      className="signal-meter"
                      variant="determinate"
                      value={signalLevel * 100}
                      sx={{
                        "& .MuiLinearProgress-bar": {
                          backgroundColor:
                            signalLevel > 0.6
                              ? theme.vars.palette.success.main
                              : signalLevel > 0.3
                              ? theme.vars.palette.warning.main
                              : theme.vars.palette.primary.main
                        }
                      }}
                    />
                  </>
                )}
              </div>
            </>
          ) : (
            <Typography
              variant="body2"
              sx={{
                fontSize: "var(--fontSizeSmall)",
                backgroundColor: "var(--palette-warning-main)",
                color: "var(--palette-grey-900)",
                padding: ".4em 0.6em",
                borderRadius: "4px"
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
