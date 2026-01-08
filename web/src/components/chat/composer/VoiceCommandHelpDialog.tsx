/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  Chip,
  Collapse,
  IconButton,
  useTheme
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import MicIcon from "@mui/icons-material/Mic";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import CloseIcon from "@mui/icons-material/Close";
import { useVoiceCommandAssistant } from "../../../hooks/browser/useVoiceCommandAssistant";

interface VoiceCommandHelpDialogProps {
  open: boolean;
  onClose: () => void;
}

interface CommandCategory {
  title: string;
  commands: {
    phrase: string;
    description: string;
    example?: string;
  }[];
}

const commandCategories: CommandCategory[] = [
  {
    title: "Workflow Creation",
    commands: [
      {
        phrase: "Create a workflow for [description]",
        description: "Creates a new workflow with the given description",
        example: "Create a workflow for image generation"
      },
      {
        phrase: "Create a text node with [content]",
        description: "Adds a text input node with the specified content",
        example: "Create a text node with 'Hello world'"
      }
    ]
  },
  {
    title: "Node Operations",
    commands: [
      {
        phrase: "Add a [type] node to the workflow",
        description: "Adds a node of the specified type to the current workflow",
        example: "Add a LLM node to the workflow"
      },
      {
        phrase: "Add a [type] input node",
        description: "Adds an input node of the specified type",
        example: "Add a text input node"
      },
      {
        phrase: "Add a [type] output node",
        description: "Adds an output node of the specified type",
        example: "Add an image output node"
      }
    ]
  },
  {
    title: "Connections",
    commands: [
      {
        phrase: "Connect [source] to [target]",
        description: "Connects two nodes in the workflow",
        example: "Connect text input to LLM node"
      }
    ]
  },
  {
    title: "Execution",
    commands: [
      {
        phrase: "Run the workflow",
        description: "Executes the current workflow",
        example: "Run the workflow"
      },
      {
        phrase: "Save the workflow",
        description: "Saves the current workflow",
        example: "Save the workflow"
      }
    ]
  }
];

export function VoiceCommandHelpDialog({ open, onClose }: VoiceCommandHelpDialogProps) {
  const theme = useTheme();
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(
    new Set(commandCategories.map((_, i) => i))
  );

  const { isSupported } = useVoiceCommandAssistant();
  const [speechSupported, setSpeechSupported] = useState(false);

  React.useEffect(() => {
    setSpeechSupported(isSupported());
  }, [isSupported]);

  const toggleCategory = (index: number) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const styles = css`
    .category-header {
      cursor: pointer;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 8px;
      background-color: ${theme.vars.palette.grey[800]};
      transition: background-color 0.2s ease;
      
      &:hover {
        background-color: ${theme.vars.palette.grey[700]};
      }
    }

    .command-item {
      padding: 8px 16px 8px 32px;
      border-left: 3px solid ${theme.vars.palette.primary.main};
      margin: 4px 0;
      border-radius: 0 8px 8px 0;
      background-color: ${theme.vars.palette.grey[900]};
    }

    .example-text {
      font-family: monospace;
      background-color: ${theme.vars.palette.grey[800]};
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.85em;
    }
  `;

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          backgroundColor: theme.vars.palette.grey[900],
          backgroundImage: "none"
        }
      }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <MicIcon color="primary" />
        <Typography variant="h6">Voice Command Help</Typography>
        <Box sx={{ flex: 1 }} />
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        {!speechSupported && (
          <Box
            sx={{
              padding: 2,
              marginBottom: 2,
              borderRadius: 8,
              backgroundColor: theme.vars.palette.warning.dark,
              color: theme.vars.palette.warning.contrastText,
              display: "flex",
              alignItems: "center",
              gap: 1
            }}
          >
            <HelpOutlineIcon />
            <Typography variant="body2">
              Speech recognition is not supported in this browser. 
              Please use Chrome or Edge for voice commands.
            </Typography>
          </Box>
        )}

        <Typography variant="body2" sx={{ mb: 3, color: theme.vars.palette.grey[400] }}>
          Use voice commands to create and edit workflows hands-free. 
          Speak clearly and use the phrases below for best results.
        </Typography>

        <Box css={styles}>
          {commandCategories.map((category, index) => (
            <Box key={index}>
              <Box
                className="category-header"
                onClick={() => toggleCategory(index)}
                sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <Typography variant="subtitle1" fontWeight="bold">
                  {category.title}
                </Typography>
                {expandedCategories.has(index) ? (
                  <ExpandLessIcon />
                ) : (
                  <ExpandMoreIcon />
                )}
              </Box>

              <Collapse in={expandedCategories.has(index)}>
                <List dense>
                  {category.commands.map((cmd, cmdIndex) => (
                    <ListItem key={cmdIndex} className="command-item">
                      <ListItemText
                        primary={
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                            <Chip 
                              label={cmd.phrase} 
                              size="small" 
                              color="primary" 
                              variant="outlined"
                              sx={{ fontFamily: "monospace" }}
                            />
                          </Box>
                        }
                        secondary={
                          <Box>
                            <Typography variant="body2" sx={{ color: theme.vars.palette.grey[400], mb: 0.5 }}>
                              {cmd.description}
                            </Typography>
                            {cmd.example && (
                              <Typography variant="body2" sx={{ color: theme.vars.palette.grey[500] }}>
                                Example: <span className="example-text">{cmd.example}</span>
                              </Typography>
                            )}
                          </Box>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              </Collapse>
            </Box>
          ))}
        </Box>

        <Box
          sx={{
            marginTop: 3,
            padding: 2,
            borderRadius: 8,
            backgroundColor: theme.vars.palette.primary.dark,
            color: theme.vars.palette.primary.contrastText
          }}
        >
          <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
            💡 Tips for Best Results
          </Typography>
          <List dense>
            <ListItem>
              <ListItemText primary="Speak clearly and at a moderate pace" />
            </ListItem>
            <ListItem>
              <ListItemText primary="Use the exact phrases shown above" />
            </ListItem>
            <ListItem>
              <ListItemText primary="Keep your command short and specific" />
            </ListItem>
            <ListItem>
              <ListItemText primary="If a command isn't recognized, try rephrasing" />
            </ListItem>
          </List>
        </Box>
      </DialogContent>

      <DialogActions sx={{ padding: "16px 24px" }}>
        <Button onClick={onClose} variant="contained">
          Got it!
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default VoiceCommandHelpDialog;
