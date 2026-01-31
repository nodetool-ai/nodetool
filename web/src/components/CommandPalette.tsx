/** @jsxImportSource @emotion/react */
/**
 * CommandPalette
 *
 * A quick actions command palette that allows users to search and execute
 * common actions, navigate to workflows, and access features via keyboard shortcuts.
 *
 * Features:
 * - Keyboard shortcut activation (Cmd/Ctrl + K)
 * - Fuzzy search for commands
 * - Categorized commands
 * - Keyboard navigation (Arrow keys, Enter, Escape)
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { css } from "@emotion/react";
import {
  Dialog,
  DialogContent,
  Box,
  Typography,
  TextField,
  List,
  ListItem,
  ListItemText,
  Divider,
  Chip
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material";
import { useCommandPaletteStore } from "../stores/CommandPaletteStore";
import { useCombo } from "../stores/KeyPressedStore";
import SearchIcon from "@mui/icons-material/Search";
import KeyboardIcon from "@mui/icons-material/Keyboard";

const styles = (theme: Theme) =>
  css({
    ".command-palette-dialog": {
      "& .MuiDialog-paper": {
        maxWidth: "600px",
        width: "90%",
        maxHeight: "500px",
        borderRadius: theme.spacing(1),
        background: theme.vars.palette.c_editor_bg_color,
        boxShadow: `0 8px 32px ${theme.vars.palette.grey[900]}40`
      }
    },
    ".command-palette-content": {
      padding: 0,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    },
    ".search-container": {
      padding: theme.spacing(2),
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1.5)
    },
    ".search-input": {
      "& .MuiInputBase-root": {
        backgroundColor: theme.vars.palette.action.hover,
        borderRadius: theme.spacing(0.75),
        fontSize: "1rem"
      },
      "& .MuiInputBase-input": {
        padding: theme.spacing(1.5, 2)
      },
      "& fieldset": {
        border: "none"
      }
    },
    ".commands-list": {
      overflowY: "auto",
      maxHeight: "350px",
      padding: theme.spacing(1)
    },
    ".command-item": {
      borderRadius: theme.spacing(0.75),
      marginBottom: theme.spacing(0.5),
      cursor: "pointer",
      transition: "all 0.15s ease",
      padding: theme.spacing(1, 1.5),
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      },
      "&.selected": {
        backgroundColor: theme.vars.palette.primary.dark,
        "& .MuiTypography-root": {
          color: theme.vars.palette.common.white
        }
      }
    },
    ".command-label": {
      fontSize: "0.95rem",
      fontWeight: 500,
      color: theme.vars.palette.text.primary
    },
    ".command-description": {
      fontSize: "0.85rem",
      color: theme.vars.palette.text.secondary,
      marginTop: theme.spacing(0.25)
    },
    ".command-category": {
      fontSize: "0.75rem",
      textTransform: "uppercase",
      fontWeight: 600,
      color: theme.vars.palette.text.secondary,
      padding: theme.spacing(1.5, 1.5, 0.5, 1.5),
      letterSpacing: "0.05em"
    },
    ".command-shortcut": {
      fontSize: "0.75rem",
      padding: theme.spacing(0.25, 0.75),
      borderRadius: theme.spacing(0.5),
      backgroundColor: theme.vars.palette.action.selected,
      color: theme.vars.palette.text.secondary,
      fontFamily: "monospace"
    },
    ".empty-state": {
      padding: theme.spacing(4),
      textAlign: "center",
      color: theme.vars.palette.text.secondary
    },
    ".keyboard-hint": {
      fontSize: "0.75rem",
      color: theme.vars.palette.text.secondary,
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.5),
      padding: theme.spacing(1, 2),
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.action.hover
    }
  });

const CommandPalette: React.FC = () => {
  const theme = useTheme();
  const isOpen = useCommandPaletteStore((state) => state.isOpen);
  const close = useCommandPaletteStore((state) => state.close);
  const toggle = useCommandPaletteStore((state) => state.toggle);
  const searchQuery = useCommandPaletteStore((state) => state.searchQuery);
  const setSearchQuery = useCommandPaletteStore((state) => state.setSearchQuery);
  const getFilteredCommands = useCommandPaletteStore((state) => state.getFilteredCommands);
  const executeCommand = useCommandPaletteStore((state) => state.executeCommand);
  
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Register keyboard shortcut: Cmd/Ctrl + K
  useCombo(["meta", "k"], toggle, true, true);
  useCombo(["control", "k"], toggle, true, true);
  
  const filteredCommands = getFilteredCommands();
  
  // Group commands by category
  const groupedCommands = filteredCommands.reduce((acc, command) => {
    const category = command.category || "Other";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(command);
    return acc;
  }, {} as Record<string, typeof filteredCommands>);
  
  // Reset selected index when commands change
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);
  
  // Focus input when dialog opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);
  
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (filteredCommands[selectedIndex]) {
        executeCommand(filteredCommands[selectedIndex].id);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }, [filteredCommands, selectedIndex, executeCommand, close]);
  
  const handleCommandClick = useCallback((commandId: string) => {
    executeCommand(commandId);
  }, [executeCommand]);
  
  return (
    <Dialog
      open={isOpen}
      onClose={close}
      className="command-palette-dialog"
      css={styles(theme)}
      maxWidth="md"
    >
      <DialogContent className="command-palette-content">
        <Box className="search-container">
          <SearchIcon sx={{ color: "text.secondary" }} />
          <TextField
            inputRef={inputRef}
            fullWidth
            placeholder="Search for commands, workflows, or actions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            className="search-input"
            variant="outlined"
          />
        </Box>
        
        <Box className="commands-list">
          {filteredCommands.length === 0 ? (
            <Box className="empty-state">
              <Typography variant="body2">
                No commands found. Try a different search term.
              </Typography>
            </Box>
          ) : (
            <List>
              {Object.entries(groupedCommands).map(([category, commands]) => (
                <React.Fragment key={category}>
                  <Typography className="command-category">
                    {category}
                  </Typography>
                  {commands.map((command, index) => {
                    const globalIndex = filteredCommands.indexOf(command);
                    return (
                      <ListItem
                        key={command.id}
                        className={`command-item ${globalIndex === selectedIndex ? "selected" : ""}`}
                        onClick={() => handleCommandClick(command.id)}
                      >
                        <ListItemText
                          primary={
                            <Box display="flex" justifyContent="space-between" alignItems="center">
                              <Typography className="command-label">
                                {command.label}
                              </Typography>
                              {command.shortcut && (
                                <Chip
                                  label={command.shortcut}
                                  size="small"
                                  className="command-shortcut"
                                />
                              )}
                            </Box>
                          }
                          secondary={
                            command.description && (
                              <Typography className="command-description">
                                {command.description}
                              </Typography>
                            )
                          }
                        />
                      </ListItem>
                    );
                  })}
                </React.Fragment>
              ))}
            </List>
          )}
        </Box>
        
        <Box className="keyboard-hint">
          <KeyboardIcon sx={{ fontSize: "0.9rem" }} />
          <Typography variant="caption">
            Use ↑↓ to navigate, Enter to select, Esc to close
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default CommandPalette;
