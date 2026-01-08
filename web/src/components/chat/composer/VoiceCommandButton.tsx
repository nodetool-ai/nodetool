/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useEffect, useState } from "react";
import { Box, Tooltip, IconButton, Badge } from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";
import StopIcon from "@mui/icons-material/Stop";
import { useTheme } from "@mui/material/styles";
import { useVoiceCommandAssistant } from "../../../hooks/browser/useVoiceCommandAssistant";

interface VoiceCommandButtonProps {
  onCommandProcessed?: (result: any) => void;
  size?: "small" | "medium" | "large";
  showTranscript?: boolean;
}

export function VoiceCommandButton({ 
  onCommandProcessed,
  size = "medium",
  showTranscript = false 
}: VoiceCommandButtonProps) {
  const theme = useTheme();
  const [mounted, setMounted] = useState(false);
  const [permissionRequested, setPermissionRequested] = useState(false);

  const {
    state,
    startListening,
    stopListening,
    clearTranscript,
    clearError,
    isSupported
  } = useVoiceCommandAssistant();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleVoiceCommand = async () => {
    if (!mounted) {
      return;
    }

    if (!isSupported()) {
      // eslint-disable-next-line no-alert
      alert("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    if (!permissionRequested) {
      setPermissionRequested(true);
    }

    if (state.isListening) {
      stopListening();
    } else {
      clearError();
      clearTranscript();
      startListening();
    }
  };

  useEffect(() => {
    if (state.transcript && !state.isProcessing && !state.isListening && onCommandProcessed) {
      onCommandProcessed({
        transcript: state.transcript,
        confidence: state.confidence,
        timestamp: Date.now()
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.transcript, state.isProcessing, state.isListening]);

  if (!mounted) {
    return null;
  }

  const buttonSizes = {
    small: { fontSize: 20, iconSize: 18 },
    medium: { fontSize: 24, iconSize: 22 },
    large: { fontSize: 32, iconSize: 28 }
  };

  const { iconSize } = buttonSizes[size];

  const isListening = state.isListening;
  const errorMain = theme.vars.palette.error.main;
  const errorContrastText = theme.vars.palette.error.contrastText;
  const errorDark = theme.vars.palette.error.dark;
  const primaryMain = theme.vars.palette.primary.main;
  const primaryContrastText = theme.vars.palette.primary.contrastText;
  const primaryDark = theme.vars.palette.primary.dark;
  const grey900 = theme.vars.palette.grey[900];
  const grey100 = theme.vars.palette.grey[100];
  const fontSizeSmall = theme.fontSizeSmall;
  const backgroundPaper = theme.vars.palette.background.paper;
  const warningMain = theme.vars.palette.warning.main;
  const successMain = theme.vars.palette.success.main;

  const styles = css`
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;

    & .voice-button {
      transition: all 0.3s ease;
      backgroundColor: ${isListening ? errorMain : primaryMain};
      color: ${isListening ? errorContrastText : primaryContrastText};
      boxShadow: ${isListening 
        ? `0 0 20px ${errorMain}80`
        : `0 2px 8px ${primaryMain}40`};
      animation: ${isListening ? "pulse 1.5s infinite" : "none"};
      &:hover {
        backgroundColor: ${isListening ? errorDark : primaryDark};
        transform: scale(1.05);
      }
      &:active {
        transform: scale(0.95);
      }
    }

    & .transcript-display {
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      margin-bottom: 8px;
      padding: 8px 12px;
      backgroundColor: ${grey900};
      color: ${grey100};
      border-radius: 8px;
      font-size: ${fontSizeSmall};
      max-width: 250px;
      white-space: pre-wrap;
      word-break: break-word;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 1000;
      opacity: ${state.transcript ? 1 : 0};
      transition: opacity 0.2s ease;
      pointer-events: ${state.transcript ? "auto" : "none"};
    }

    & .status-indicator {
      position: absolute;
      top: 0;
      right: 0;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background-color: ${state.isProcessing 
        ? warningMain 
        : isListening 
          ? errorMain 
          : successMain};
      border: 2px solid ${backgroundPaper};
      animation: ${isListening ? "pulse 1s infinite" : "none"};
    }

    @keyframes pulse {
      0% {
        box-shadow: 0 0 0 0 rgba(244, 67, 54, 0.4);
      }
      70% {
        box-shadow: 0 0 0 10px rgba(244, 67, 54, 0);
      }
      100% {
        box-shadow: 0 0 0 0 rgba(244, 67, 54, 0);
      }
    }
  `;

  const errorStyles = css`
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 8px;
    padding: 8px 12px;
    background-color: ${theme.vars.palette.error.main};
    color: ${theme.vars.palette.error.contrastText};
    border-radius: 8px;
    font-size: ${theme.fontSizeSmall};
    max-width: 250px;
    white-space: pre-wrap;
    z-index: 1000;
  `;

  const statusIndicatorStyles = css`
    animation: ${state.isListening ? "pulse 1s infinite" : "none"};
    @keyframes pulse {
      0% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.2); opacity: 0.7; }
      100% { transform: scale(1); opacity: 1; }
    }
  `;

  return (
    <Box css={styles} sx={{ position: "relative" }}>
      <Tooltip 
        title={state.isListening 
          ? "Click to stop recording" 
          : "Click to speak a voice command"
        }
        placement="top"
      >
        <Badge
          overlap="circular"
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          badgeContent={
            <Box css={statusIndicatorStyles} />
          }
        >
          <IconButton
            className="voice-button"
            onClick={handleVoiceCommand}
            size={size}
            sx={{
              width: size === "small" ? 36 : size === "medium" ? 48 : 60,
              height: size === "small" ? 36 : size === "medium" ? 48 : 60,
              borderRadius: "50%"
            }}
          >
            {state.isListening ? (
              <StopIcon sx={{ fontSize: iconSize }} />
            ) : (
              <MicIcon sx={{ fontSize: iconSize }} />
            )}
          </IconButton>
        </Badge>
      </Tooltip>

      {showTranscript && state.transcript && (
        <Box className="transcript-display">
          {state.transcript}
        </Box>
      )}

      {state.error && (
        <Box css={errorStyles}>
          {state.error}
        </Box>
      )}
    </Box>
  );
}

export default VoiceCommandButton;
