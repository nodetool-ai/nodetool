/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useState } from "react";
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Chip,
  Collapse,
  Divider,
  useTheme
} from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import { VoiceCommandButton } from "./VoiceCommandButton";
import { VoiceCommandHelpDialog } from "./VoiceCommandHelpDialog";

interface VoiceCommandPanelProps {
  onCommandProcessed?: (result: any) => void;
  compact?: boolean;
}

export function VoiceCommandPanel({ onCommandProcessed, compact = false }: VoiceCommandPanelProps) {
  const theme = useTheme();
  const [showHelp, setShowHelp] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const [lastCommand, setLastCommand] = useState<{
    transcript: string;
    success: boolean;
    action?: string;
  } | null>(null);

  const handleCommandProcessed = (result: any) => {
    setLastCommand({
      transcript: result.transcript,
      success: true,
      action: "Voice command sent to AI assistant"
    });
    onCommandProcessed?.(result);
  };

  const quickCommands = [
    { phrase: "Create a workflow for...", description: "Start a new workflow" },
    { phrase: "Add a LLM node", description: "Add language model node" },
    { phrase: "Connect text to LLM", description: "Connect nodes" },
    { phrase: "Run the workflow", description: "Execute workflow" }
  ];

  const styles = css`
    .voice-panel {
      background: linear-gradient(135deg, 
        ${theme.vars.palette.grey[900]} 0%, 
        ${theme.vars.palette.grey[800]} 100%);
      border: 1px solid ${theme.vars.palette.grey[700]};
      border-radius: 12px;
      overflow: hidden;
    }

    .command-history {
      max-height: 150px;
      overflow-y: auto;
      padding: 8px;
      background-color: ${theme.vars.palette.grey[950]};
      border-top: 1px solid ${theme.vars.palette.grey[700]};
    }

    .quick-command {
      transition: all 0.2s ease;
      cursor: pointer;
      &:hover {
        background-color: ${theme.vars.palette.primary.dark}40;
        transform: translateX(4px);
      }
    }

    .listening-indicator {
      animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  `;

  if (compact) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <VoiceCommandButton 
          onCommandProcessed={handleCommandProcessed}
          size="medium"
          showTranscript={true}
        />
        <Tooltip title="Voice Command Help">
          <IconButton onClick={() => setShowHelp(true)} size="small">
            <HelpOutlineIcon />
          </IconButton>
        </Tooltip>
        
        <VoiceCommandHelpDialog 
          open={showHelp} 
          onClose={() => setShowHelp(false)} 
        />
      </Box>
    );
  }

  return (
    <Box css={styles}>
      <Box className="voice-panel" sx={{ p: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <MicIcon color="primary" />
            <Typography variant="subtitle1" fontWeight="bold">
              Voice Commands
            </Typography>
          </Box>
          <Tooltip title="Show help">
            <IconButton onClick={() => setShowHelp(true)} size="small">
              <HelpOutlineIcon />
            </IconButton>
          </Tooltip>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", my: 3 }}>
          <VoiceCommandButton 
            onCommandProcessed={handleCommandProcessed}
            size="large"
            showTranscript={true}
          />
        </Box>

        <Typography variant="body2" sx={{ textAlign: "center", color: theme.vars.palette.grey[400], mb: 2 }}>
          Click the microphone and speak a command
        </Typography>

        <Divider sx={{ my: 2, borderColor: theme.vars.palette.grey[700] }} />

        <Box
          sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
          onClick={() => setShowExamples(!showExamples)}
        >
          <Typography variant="subtitle2" color="primary">
            Quick Commands
          </Typography>
          {showExamples ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </Box>

        <Collapse in={showExamples}>
          <Box sx={{ mt: 1 }}>
            {quickCommands.map((cmd, index) => (
              <Box
                key={index}
                className="quick-command"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  p: 1,
                  borderRadius: 1,
                  mb: 0.5
                }}
              >
                <Chip label={cmd.phrase} size="small" color="primary" variant="outlined" />
                <Typography variant="body2" sx={{ color: theme.vars.palette.grey[400] }}>
                  {cmd.description}
                </Typography>
              </Box>
            ))}
          </Box>
        </Collapse>

        {lastCommand && (
          <Box className="command-history" sx={{ mt: 2 }}>
            <Typography variant="caption" sx={{ color: theme.vars.palette.grey[500], mb: 1, display: "block" }}>
              Last command:
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {lastCommand.success ? (
                <CheckCircleIcon sx={{ fontSize: 16, color: theme.vars.palette.success.main }} />
              ) : (
                <ErrorIcon sx={{ fontSize: 16, color: theme.vars.palette.error.main }} />
              )}
              <Typography variant="body2" sx={{ color: theme.vars.palette.grey[300] }}>
                &quot;{lastCommand.transcript}&quot;
              </Typography>
            </Box>
          </Box>
        )}
      </Box>

      <VoiceCommandHelpDialog 
        open={showHelp} 
        onClose={() => setShowHelp(false)} 
      />
    </Box>
  );
}

export default VoiceCommandPanel;
