import React, { useCallback } from "react";
import {
  Box,
  Paper,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  Tooltip,
  Divider
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import HistoryIcon from "@mui/icons-material/History";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useHistoryStore } from "../../stores/HistoryStore";
import { useTemporalNodes } from "../../contexts/NodeContext";
import { isMac } from "../../utils/platform";

interface HistoryPanelProps {
  onJumpToState?: (stateIndex: number) => void;
}

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

const getActionIcon = (actionType: string): React.ReactNode => {
  switch (actionType) {
    case "addNode":
    case "paste":
      return <UndoIcon fontSize="small" sx={{ color: "success.main" }} />;
    case "deleteNode":
    case "cut":
      return <UndoIcon fontSize="small" sx={{ color: "error.main" }} />;
    case "moveNode":
      return <UndoIcon fontSize="small" sx={{ color: "info.main" }} />;
    case "connectNode":
    case "disconnectNode":
      return <UndoIcon fontSize="small" sx={{ color: "warning.main" }} />;
    case "updateNodeData":
      return <UndoIcon fontSize="small" sx={{ color: "secondary.main" }} />;
    default:
      return <HistoryIcon fontSize="small" sx={{ color: "text.secondary" }} />;
  }
};

const getActionDescription = (actionType: string): string => {
  switch (actionType) {
    case "addNode":
      return "Added node";
    case "deleteNode":
      return "Deleted node";
    case "moveNode":
      return "Moved node";
    case "connectNode":
      return "Connected nodes";
    case "disconnectNode":
      return "Disconnected nodes";
    case "updateNodeData":
      return "Updated node properties";
    case "selectNodes":
      return "Selection change";
    case "groupNodes":
      return "Grouped nodes";
    case "ungroupNodes":
      return "Ungrouped nodes";
    case "paste":
      return "Pasted nodes";
    case "cut":
      return "Cut nodes";
    case "duplicate":
      return "Duplicated nodes";
    default:
      return "Edit action";
  }
};

export const HistoryPanel: React.FC<HistoryPanelProps> = ({ onJumpToState }) => {
  const isOpen = useHistoryStore((state) => state.isOpen);
  const entries = useHistoryStore((state) => state.entries);
  const selectedEntryId = useHistoryStore((state) => state.selectedEntryId);
  const setIsOpen = useHistoryStore((state) => state.setIsOpen);
  const setSelectedEntry = useHistoryStore((state) => state.setSelectedEntry);
  const clearEntries = useHistoryStore((state) => state.clearEntries);

  const temporalState = useTemporalNodes((state) => state);
  const canUndo = temporalState.pastStates && temporalState.pastStates.length > 0;
  const canRedo = temporalState.futureStates && temporalState.futureStates.length > 0;

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, [setIsOpen]);

  const handleUndo = useCallback(() => {
    temporalState.undo?.();
    setSelectedEntry(null);
  }, [temporalState, setSelectedEntry]);

  const handleRedo = useCallback(() => {
    temporalState.redo?.();
    setSelectedEntry(null);
  }, [temporalState, setSelectedEntry]);

  const handleJumpToEntry = useCallback((entry: typeof entries[0], index: number) => {
    setSelectedEntry(entry.id);
    onJumpToState?.(index);
  }, [setSelectedEntry, onJumpToState]);

  const handleClearHistory = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    clearEntries();
  }, [clearEntries]);

  const keyboardShortcut = isMac() ? "⌘H" : "Ctrl+H";

  if (!isOpen) {
    return null;
  }

  return (
    <Paper
      elevation={8}
      sx={{
        position: "absolute",
        top: 60,
        right: 16,
        width: 320,
        maxHeight: "calc(100vh - 200px)",
        display: "flex",
        flexDirection: "column",
        zIndex: 1300,
        borderRadius: 2,
        overflow: "hidden"
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1,
          bgcolor: "primary.main",
          color: "primary.contrastText"
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <HistoryIcon fontSize="small" />
          <Typography variant="subtitle2" fontWeight={600}>
            History
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Tooltip title={`Undo (${keyboardShortcut}+Z)`}>
            <span>
              <IconButton
                size="small"
                onClick={handleUndo}
                disabled={!canUndo}
                sx={{ color: "inherit", "&.Mui-disabled": { opacity: 0.5 } }}
              >
                <UndoIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={`Redo (${keyboardShortcut}+Shift+Z)`}>
            <span>
              <IconButton
                size="small"
                onClick={handleRedo}
                disabled={!canRedo}
                sx={{ color: "inherit", "&.Mui-disabled": { opacity: 0.5 } }}
              >
                <RedoIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Close (Esc)">
            <IconButton
              size="small"
              onClick={handleClose}
              sx={{ color: "inherit" }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1,
          bgcolor: "action.hover",
          borderBottom: 1,
          borderColor: "divider"
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {entries.length} {entries.length === 1 ? "entry" : "entries"} in history
        </Typography>
        <Tooltip title="Clear history">
          <IconButton size="small" onClick={handleClearHistory} disabled={entries.length === 0}>
            <DeleteSweepIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Box
        sx={{
          flex: 1,
          overflow: "auto",
          bgcolor: "background.default"
        }}
      >
        {entries.length === 0 ? (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <HistoryIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              No history yet
            </Typography>
            <Typography variant="caption" color="text.disabled">
              Start editing to track your changes
            </Typography>
          </Box>
        ) : (
          <List dense sx={{ py: 0 }}>
            {entries.map((entry, index) => {
              const isSelected = entry.id === selectedEntryId;
              return (
                <ListItem
                  key={entry.id}
                  disablePadding
                  sx={{
                    borderBottom: 1,
                    borderColor: "divider",
                    bgcolor: isSelected ? "action.selected" : "transparent"
                  }}
                >
                  <ListItemButton
                    onClick={() => handleJumpToEntry(entry, index)}
                    sx={{
                      py: 1,
                      "&:hover": {
                        bgcolor: "action.hover"
                      }
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, width: "100%" }}>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minWidth: 24,
                          mt: 0.25
                        }}
                      >
                        {getActionIcon(entry.actionType)}
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Typography
                            variant="body2"
                            fontWeight={500}
                            sx={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap"
                            }}
                          >
                            {getActionDescription(entry.actionType)}
                          </Typography>
                        </Box>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.25 }}>
                          <Typography variant="caption" color="text.secondary">
                            {formatTime(entry.timestamp)}
                          </Typography>
                          <Typography variant="caption" color="text.disabled">
                            •
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {entry.nodeCount} nodes
                          </Typography>
                          <Typography variant="caption" color="text.disabled">
                            •
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {entry.edgeCount} edges
                          </Typography>
                        </Box>
                        {entry.description && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              display: "block",
                              mt: 0.5,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap"
                            }}
                          >
                            {entry.description}
                          </Typography>
                        )}
                      </Box>
                      {isSelected && (
                        <Tooltip title="Go to this state">
                          <OpenInNewIcon fontSize="small" sx={{ color: "primary.main" }} />
                        </Tooltip>
                      )}
                    </Box>
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        )}
      </Box>

      <Divider />

      <Box
        sx={{
          px: 2,
          py: 1.5,
          bgcolor: "action.hover",
          borderTop: 1,
          borderColor: "divider"
        }}
      >
        <Typography variant="caption" color="text.secondary">
          Keyboard: {keyboardShortcut} to open, {keyboardShortcut}+Z to undo, {keyboardShortcut}+Shift+Z to redo, Esc to close
        </Typography>
      </Box>
    </Paper>
  );
};

export default HistoryPanel;
