import React, { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  Paper,
  Tabs,
  Tab,
  Alert,
  Divider,
  Tooltip
} from "@mui/material";
import {
  Restore as RestoreIcon,
  Edit as EditIcon,
  Check as CheckIcon,
  Keyboard as KeyboardIcon,
  Warning as WarningIcon
} from "@mui/icons-material";
import { NODE_EDITOR_SHORTCUTS, SHORTCUT_CATEGORIES } from "../../config/shortcuts";
import { useCustomShortcutsStore } from "../../stores/CustomShortcutsStore";
import { formatComboForDisplay, isValidKey, KEY_DISPLAY_NAMES } from "../../stores/CustomShortcutsStore";
import { useNotificationStore } from "../../stores/NotificationStore";

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => {
  return (
    <div hidden={value !== index} style={{ padding: "16px 0" }}>
      {value === index && children}
    </div>
  );
};

interface ShortcutCustomizerProps {
  open: boolean;
  onClose: () => void;
}

export const ShortcutCustomizer: React.FC<ShortcutCustomizerProps> = ({
  open,
  onClose
}) => {
  const { customShortcuts, setCustomShortcut, removeCustomShortcut, resetAllShortcuts, getConflicts } = useCustomShortcutsStore();
  const { addNotification } = useNotificationStore();
  
  const [tabValue, setTabValue] = useState(0);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [recordingKeys, setRecordingKeys] = useState<string[]>([]);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const categories = Object.entries(SHORTCUT_CATEGORIES);

  const updateConflictWarning = useCallback((keys: string[]) => {
    if (keys.length === 0) {
      setConflictWarning(null);
      return;
    }

    const conflicts = getConflicts(keys, editingSlug || undefined);
    if (conflicts.length > 0) {
      const shortcut = NODE_EDITOR_SHORTCUTS.find(s => s.slug === conflicts[0]);
      setConflictWarning(`This shortcut is already used by: ${shortcut?.title || conflicts[0]}`);
    } else {
      setConflictWarning(null);
    }
  }, [editingSlug, getConflicts]);

  const handleStartRecording = (slug: string) => {
    setEditingSlug(slug);
    setRecordingKeys([]);
    setConflictWarning(null);
  };

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!editingSlug) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const key = event.key.toLowerCase();

    if (key === "escape") {
      setEditingSlug(null);
      setRecordingKeys([]);
      setConflictWarning(null);
      return;
    }

    if (key === "backspace" || key === "delete") {
      setRecordingKeys((prev) => {
        const newKeys = prev.slice(0, -1);
        updateConflictWarning(newKeys);
        return newKeys;
      });
      return;
    }

    let modifierKey = "";
    if (event.ctrlKey || event.metaKey) {
      modifierKey = "control";
    } else if (event.altKey) {
      modifierKey = "alt";
    } else if (event.shiftKey) {
      modifierKey = "shift";
    }

    const displayKey = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();
    
    if (modifierKey && !recordingKeys.includes(modifierKey)) {
      const newKeys = [modifierKey, ...recordingKeys.filter(k => !["control", "alt", "shift"].includes(k))];
      setRecordingKeys(newKeys);
      updateConflictWarning(newKeys);
    } else if (!modifierKey && isValidKey(displayKey) && !recordingKeys.includes(displayKey)) {
      const newKeys = [...recordingKeys, displayKey];
      setRecordingKeys(newKeys);
      updateConflictWarning(newKeys);
    }
  }, [editingSlug, recordingKeys, updateConflictWarning]);

  useEffect(() => {
    if (editingSlug) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [editingSlug, handleKeyDown]);

  const handleSaveRecording = () => {
    if (editingSlug && recordingKeys.length > 0) {
      setCustomShortcut(editingSlug, recordingKeys);
      addNotification({
        content: `Shortcut updated for "${NODE_EDITOR_SHORTCUTS.find(s => s.slug === editingSlug)?.title}"`,
        type: "success",
        alert: true
      });
    }
    setEditingSlug(null);
    setRecordingKeys([]);
    setConflictWarning(null);
  };

  const handleCancelRecording = () => {
    setEditingSlug(null);
    setRecordingKeys([]);
    setConflictWarning(null);
  };

  const handleRemoveCustom = (slug: string) => {
    removeCustomShortcut(slug);
    addNotification({
      content: `Shortcut reset to default for "${NODE_EDITOR_SHORTCUTS.find(s => s.slug === slug)?.title}"`,
      type: "info",
      alert: true
    });
  };

  const handleResetAll = () => {
    resetAllShortcuts();
    addNotification({
      content: "All shortcuts reset to defaults",
      type: "info",
      alert: true
    });
  };

  const getEffectiveCombo = (slug: string, defaultCombo: string[]) => {
    const custom = customShortcuts[slug];
    if (custom?.useCustom) {
      return custom.customCombo;
    }
    return defaultCombo;
  };

  const filteredShortcuts = NODE_EDITOR_SHORTCUTS.filter(
    (shortcut) =>
      shortcut.registerCombo &&
      (shortcut.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        shortcut.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
        formatComboForDisplay(shortcut.keyCombo).toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const getShortcutsByCategory = (category: string) => {
    return filteredShortcuts.filter((s) => s.category === category);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { minHeight: "60vh", maxHeight: "80vh" }
      }}
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <KeyboardIcon />
          <Typography variant="h6">Customize Keyboard Shortcuts</Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent dividers>
        <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
            <Tab label="All Shortcuts" />
            {categories.map(([key, label]) => (
              <Tab key={key} label={label} />
            ))}
          </Tabs>
        </Box>

        <Box sx={{ mt: 2, mb: 2 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search shortcuts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </Box>

        {tabValue === 0 ? (
          <List>
            {filteredShortcuts.map((shortcut) => {
              const effectiveCombo = getEffectiveCombo(shortcut.slug, shortcut.keyCombo);
              const isCustom = customShortcuts[shortcut.slug]?.useCustom;
              const isEditing = editingSlug === shortcut.slug;
              const conflicts = getConflicts(effectiveCombo, shortcut.slug);

              return (
                <React.Fragment key={shortcut.slug}>
                  <ListItem
                    sx={{
                      bgcolor: isEditing ? "action.hover" : "transparent",
                      borderRadius: 1,
                      mb: 0.5
                    }}
                  >
                    <ListItemText
                      primary={
                        <Box display="flex" alignItems="center" gap={1}>
                          <Typography>{shortcut.title}</Typography>
                          {isCustom && (
                            <Chip label="Custom" size="small" color="primary" variant="outlined" />
                          )}
                          {conflicts.length > 0 && !isEditing && (
                            <Tooltip title={`Also used by: ${conflicts.join(", ")}`}>
                              <WarningIcon fontSize="small" color="warning" />
                            </Tooltip>
                          )}
                        </Box>
                      }
                      secondary={
                        <Typography variant="body2" color="text.secondary">
                          {shortcut.description}
                        </Typography>
                      }
                    />
                    <ListItemSecondaryAction>
                      {isEditing ? (
                        <Box display="flex" alignItems="center" gap={1}>
                          <Paper
                            elevation={0}
                            sx={{
                              px: 2,
                              py: 1,
                              bgcolor: "action.selected",
                              borderRadius: 1,
                              minWidth: 150,
                              display: "flex",
                              alignItems: "center",
                              gap: 0.5
                            }}
                          >
                            {recordingKeys.length > 0 ? (
                              recordingKeys.map((key) => (
                                <Chip
                                  key={key}
                                  label={KEY_DISPLAY_NAMES[key] || key.toUpperCase()}
                                  size="small"
                                  sx={{ height: 24 }}
                                />
                              ))
                            ) : (
                              <Typography variant="body2" color="text.secondary">
                                Press keys...
                              </Typography>
                            )}
                          </Paper>
                          <Button
                            size="small"
                            variant="contained"
                            color="success"
                            onClick={handleSaveRecording}
                            disabled={recordingKeys.length === 0 || !!conflictWarning}
                            startIcon={<CheckIcon />}
                          >
                            Save
                          </Button>
                          <Button size="small" onClick={handleCancelRecording}>
                            Cancel
                          </Button>
                        </Box>
                      ) : (
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <Paper
                            elevation={0}
                            sx={{
                              px: 1.5,
                              py: 0.5,
                              bgcolor: isCustom ? "primary.light" : "action.hover",
                              color: isCustom ? "primary.contrastText" : "text.primary",
                              borderRadius: 1,
                              minWidth: 100,
                              textAlign: "center"
                            }}
                          >
                            <Typography variant="body2" fontWeight="medium">
                              {formatComboForDisplay(effectiveCombo)}
                            </Typography>
                          </Paper>
                          <Tooltip title="Edit shortcut">
                            <IconButton size="small" onClick={() => handleStartRecording(shortcut.slug)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {isCustom && (
                            <Tooltip title="Reset to default">
                              <IconButton size="small" onClick={() => handleRemoveCustom(shortcut.slug)}>
                                <RestoreIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      )}
                    </ListItemSecondaryAction>
                  </ListItem>
                  {conflictWarning && isEditing && (
                    <Box sx={{ px: 2, pb: 1 }}>
                      <Alert severity="warning" icon={<WarningIcon />}>
                        {conflictWarning}
                      </Alert>
                    </Box>
                  )}
                </React.Fragment>
              );
            })}
          </List>
        ) : (
          categories.map(([categoryKey, _categoryLabel], index) => (
            <TabPanel key={categoryKey} value={tabValue} index={index + 1}>
              <List>
                {getShortcutsByCategory(categoryKey).map((shortcut) => {
                  const effectiveCombo = getEffectiveCombo(shortcut.slug, shortcut.keyCombo);
                  const isCustom = customShortcuts[shortcut.slug]?.useCustom;
                  const isEditing = editingSlug === shortcut.slug;

                  return (
                    <ListItem
                      key={shortcut.slug}
                      sx={{
                        bgcolor: isEditing ? "action.hover" : "transparent",
                        borderRadius: 1,
                        mb: 0.5
                      }}
                    >
                      <ListItemText
                        primary={
                          <Box display="flex" alignItems="center" gap={1}>
                            <Typography>{shortcut.title}</Typography>
                            {isCustom && (
                              <Chip label="Custom" size="small" color="primary" variant="outlined" />
                            )}
                          </Box>
                        }
                        secondary={shortcut.description}
                      />
                      <ListItemSecondaryAction>
                        {isEditing ? (
                          <Box display="flex" alignItems="center" gap={1}>
                            <Paper
                              elevation={0}
                              sx={{
                                px: 2,
                                py: 1,
                                bgcolor: "action.selected",
                                borderRadius: 1,
                                minWidth: 150
                              }}
                            >
                              {recordingKeys.length > 0 ? (
                                recordingKeys.map((key) => (
                                  <Chip
                                    key={key}
                                    label={KEY_DISPLAY_NAMES[key] || key.toUpperCase()}
                                    size="small"
                                    sx={{ height: 24 }}
                                  />
                                ))
                              ) : (
                                <Typography variant="body2" color="text.secondary">
                                  Press keys...
                                </Typography>
                              )}
                            </Paper>
                            <Button
                              size="small"
                              variant="contained"
                              color="success"
                              onClick={handleSaveRecording}
                              disabled={recordingKeys.length === 0 || !!conflictWarning}
                            >
                              Save
                            </Button>
                            <Button size="small" onClick={handleCancelRecording}>
                              Cancel
                            </Button>
                          </Box>
                        ) : (
                          <Box display="flex" alignItems="center" gap={0.5}>
                            <Paper
                              elevation={0}
                              sx={{
                                px: 1.5,
                                py: 0.5,
                                bgcolor: isCustom ? "primary.light" : "action.hover",
                                color: isCustom ? "primary.contrastText" : "text.primary",
                                borderRadius: 1,
                                minWidth: 100,
                                textAlign: "center"
                              }}
                            >
                              <Typography variant="body2" fontWeight="medium">
                                {formatComboForDisplay(effectiveCombo)}
                              </Typography>
                            </Paper>
                            <Tooltip title="Edit shortcut">
                              <IconButton size="small" onClick={() => handleStartRecording(shortcut.slug)}>
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            {isCustom && (
                              <Tooltip title="Reset to default">
                                <IconButton size="small" onClick={() => handleRemoveCustom(shortcut.slug)}>
                                  <RestoreIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        )}
                      </ListItemSecondaryAction>
                    </ListItem>
                  );
                })}
              </List>
            </TabPanel>
          ))
        )}

        {Object.keys(customShortcuts).length > 0 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="body2" color="text.secondary">
                {Object.keys(customShortcuts).length} custom shortcut(s) configured
              </Typography>
              <Button
                size="small"
                startIcon={<RestoreIcon />}
                onClick={handleResetAll}
                color="inherit"
              >
                Reset All to Defaults
              </Button>
            </Box>
          </>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ShortcutCustomizer;
