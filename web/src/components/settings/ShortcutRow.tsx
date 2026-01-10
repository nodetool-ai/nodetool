/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  Box,
  Button,
  Typography,
  IconButton,
  Tooltip,
  Paper
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import {
  Shortcut
} from "../../config/shortcuts";
import { CustomShortcut } from "../../stores/ShortcutSettingsStore";

interface ShortcutRowProps {
  shortcut: Shortcut;
  customShortcut: CustomShortcut | null;
  isEditing: boolean;
  isMac: boolean;
  isConflicting: (slug: string, combo: string[], excludeSlug?: string) => boolean;
  onEditStart: () => void;
  onEditCancel: () => void;
  onEditComplete: (combo: string[], macCombo?: string[]) => void;
  onReset: () => void;
}

const styles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      padding: "0.75em",
      backgroundColor: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: "8px",
      transition: "all 0.2s ease"
    },
    "&.editing": {
      borderColor: theme.vars.palette.primary.main,
      boxShadow: `0 0 0 2px ${theme.vars.palette.primary.main}20`
    },
    "&.customized": {
      borderLeftWidth: "3px",
      borderLeftColor: theme.vars.palette.primary.main
    },
    ".header": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: "0.5em"
    },
    ".title-section": {
      flex: 1,
      minWidth: 0
    },
    ".title": {
      fontSize: "0.9em",
      fontWeight: 500,
      color: theme.vars.palette.text.primary,
      marginBottom: "0.25em"
    },
    ".description": {
      fontSize: "0.75em",
      color: theme.vars.palette.text.secondary
    },
    ".actions": {
      display: "flex",
      gap: "0.25em",
      opacity: 0,
      transition: "opacity 0.2s ease"
    },
    "&:hover .actions": {
      opacity: 1
    },
    ".shortcut-display": {
      display: "flex",
      alignItems: "center",
      gap: "0.5em",
      marginTop: "0.5em",
      padding: "0.5em",
      backgroundColor: theme.vars.palette.action.hover,
      borderRadius: "4px"
    },
    ".shortcut-keys": {
      display: "flex",
      gap: "0.25em",
      flexWrap: "wrap"
    },
    ".key": {
      padding: "0.2em 0.5em",
      backgroundColor: theme.vars.palette.background.default,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: "4px",
      fontSize: "0.75em",
      fontFamily: theme.fontFamily2,
      fontWeight: 500,
      minWidth: "1.5em",
      textAlign: "center"
    },
    ".edit-area": {
      marginTop: "0.5em",
      padding: "0.75em",
      backgroundColor: theme.vars.palette.action.selected,
      borderRadius: "4px"
    },
    ".edit-instructions": {
      fontSize: "0.75em",
      color: theme.vars.palette.text.secondary,
      marginBottom: "0.5em"
    },
    ".recorded-keys": {
      display: "flex",
      gap: "0.25em",
      flexWrap: "wrap",
      marginBottom: "0.5em"
    },
    ".recorded-key": {
      padding: "0.2em 0.5em",
      backgroundColor: theme.vars.palette.primary.main,
      color: theme.vars.palette.primary.contrastText,
      borderRadius: "4px",
      fontSize: "0.75em",
      fontFamily: theme.fontFamily2
    },
    ".edit-actions": {
      display: "flex",
      gap: "0.5em",
      justifyContent: "flex-end"
    },
    ".platform-toggle": {
      display: "flex",
      gap: "0.5em",
      marginBottom: "0.5em"
    },
    ".custom-badge": {
      fontSize: "0.65em",
      padding: "0.1em 0.4em",
      backgroundColor: theme.vars.palette.primary.main,
      color: theme.vars.palette.primary.contrastText,
      borderRadius: "4px",
      marginLeft: "0.5em",
      textTransform: "uppercase"
    }
  });

const formatKey = (key: string): string => {
  const keyMap: Record<string, string> = {
    control: "Ctrl",
    meta: "⌘",
    alt: "Alt",
    option: "⌥",
    shift: "Shift",
    escape: "Esc",
    enter: "Enter",
    backspace: "Backspace",
    delete: "Del",
    tab: "Tab",
    arrowup: "↑",
    arrowdown: "↓",
    arrowleft: "←",
    arrowright: "→",
    " ": "Space"
  };
  const lowerKey = key.toLowerCase();
  return keyMap[lowerKey] || (key.length === 1 ? key.toUpperCase() : key);
};

const KeyDisplay = ({ children }: { children: React.ReactNode }) => (
  <Box
    component="span"
    sx={{
      px: 0.5,
      py: 0.25,
      bgcolor: "background.default",
      border: "1px solid",
      borderColor: "divider",
      borderRadius: 1,
      fontSize: "0.75em",
      fontFamily: "monospace",
      fontWeight: 500,
      minWidth: "1.5em",
      textAlign: "center",
      display: "inline-block"
    }}
  >
    {children}
  </Box>
);

const ShortcutRow: React.FC<ShortcutRowProps> = ({
  shortcut,
  customShortcut,
  isEditing,
  isMac,
  isConflicting,
  onEditStart,
  onEditCancel,
  onEditComplete,
  onReset
}) => {
  const theme = useTheme();
  const [recordedKeys, setRecordedKeys] = useState<string[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [editingPlatform, setEditingPlatform] = useState<"win" | "mac">("win");
  const [hasConflict, setHasConflict] = useState(false);
  const recordedKeysRef = useRef<string[]>([]);

  const effectiveCombo = customShortcut
    ? (editingPlatform === "mac" && customShortcut.keyComboMac
        ? customShortcut.keyComboMac
        : customShortcut.keyCombo)
    : (isMac && shortcut.keyComboMac
        ? shortcut.keyComboMac
        : shortcut.keyCombo);

  useEffect(() => {
    if (isEditing) {
      const initialCombo = customShortcut
        ? (editingPlatform === "mac" && customShortcut.keyComboMac
            ? customShortcut.keyComboMac
            : customShortcut.keyCombo)
        : (isMac && shortcut.keyComboMac
            ? shortcut.keyComboMac
            : shortcut.keyCombo);
      setRecordedKeys([...initialCombo]);
      recordedKeysRef.current = [...initialCombo];
      setHasConflict(false);
    }
  }, [isEditing, editingPlatform, customShortcut, shortcut, isMac]);

  useEffect(() => {
    if (!isRecording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      let key = e.key;

      if (key === "Escape") {
        setIsRecording(false);
        return;
      } else if (key.length === 1) {
        key = key.toLowerCase();
      }

      const newKeys = [...recordedKeysRef.current, key];

      if (isConflicting(shortcut.slug, newKeys, shortcut.slug)) {
        setHasConflict(true);
      } else {
        setHasConflict(false);
      }

      recordedKeysRef.current = newKeys;
      setRecordedKeys(newKeys);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRecording, isConflicting, shortcut.slug]);

  const handleStartRecording = useCallback(() => {
    setIsRecording(true);
    setRecordedKeys([]);
    recordedKeysRef.current = [];
    setHasConflict(false);
  }, []);

  const handleConfirm = useCallback(() => {
    if (recordedKeys.length === 0 || hasConflict) {
      onEditCancel();
      return;
    }

    let macCombo: string[] | undefined;
    if (editingPlatform === "win") {
      macCombo = customShortcut?.keyComboMac || shortcut.keyComboMac;
    }

    onEditComplete(recordedKeys, macCombo);
    setIsRecording(false);
  }, [recordedKeys, hasConflict, editingPlatform, customShortcut, shortcut, onEditComplete]);

  const handleClear = useCallback(() => {
    setRecordedKeys([]);
    recordedKeysRef.current = [];
    setHasConflict(false);
  }, []);

  const handleCancel = useCallback(() => {
    setIsRecording(false);
    onEditCancel();
  }, [onEditCancel]);

  return (
    <Paper
      css={styles(theme)}
      className={`${isEditing ? "editing" : ""} ${customShortcut ? "customized" : ""}`}
      elevation={0}
    >
      <div className="header">
        <div className="title-section">
          <Typography className="title">
            {shortcut.title}
            {customShortcut && <span className="custom-badge">Custom</span>}
          </Typography>
          {shortcut.description && (
            <Typography className="description">{shortcut.description}</Typography>
          )}
        </div>
        <div className="actions">
          {!isEditing && (
            <>
              <Tooltip title="Edit shortcut">
                <IconButton size="small" onClick={onEditStart}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              {customShortcut && (
                <Tooltip title="Reset to default">
                  <IconButton size="small" onClick={onReset}>
                    <RestartAltIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </>
          )}
        </div>
      </div>

      {!isEditing ? (
        <div className="shortcut-display">
          <div className="shortcut-keys">
            {effectiveCombo.map((key, idx) => (
              <React.Fragment key={idx}>
                <KeyDisplay>{formatKey(key)}</KeyDisplay>
                {idx < effectiveCombo.length - 1 && (
                  <Typography component="span" sx={{ color: "text.secondary" }}>
                    +
                  </Typography>
                )}
              </React.Fragment>
            ))}
          </div>
          {isMac && shortcut.keyComboMac && JSON.stringify(shortcut.keyComboMac) !== JSON.stringify(shortcut.keyCombo) && (
            <Typography variant="caption" sx={{ color: "text.secondary", ml: 1 }}>
              (Mac: {shortcut.keyComboMac.map(formatKey).join(" + ")})
            </Typography>
          )}
        </div>
      ) : (
        <div className="edit-area">
          {!isRecording ? (
            <>
              <div className="platform-toggle">
                <Button
                  size="small"
                  variant={editingPlatform === "win" ? "contained" : "outlined"}
                  onClick={() => setEditingPlatform("win")}
                >
                  Windows/Linux
                </Button>
                <Button
                  size="small"
                  variant={editingPlatform === "mac" ? "contained" : "outlined"}
                  onClick={() => setEditingPlatform("mac")}
                >
                  macOS
                </Button>
              </div>
              <Button
                variant="outlined"
                onClick={handleStartRecording}
                fullWidth
              >
                Click to record shortcut
              </Button>
            </>
          ) : (
            <>
              <Typography className="edit-instructions">
                Press keys for shortcut (ESC to cancel)
              </Typography>
              <div className="recorded-keys">
                {recordedKeys.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Press any key...
                  </Typography>
                ) : (
                  recordedKeys.map((key, idx) => (
                    <React.Fragment key={idx}>
                      <span className="recorded-key">{formatKey(key)}</span>
                      {idx < recordedKeys.length - 1 && (
                        <Typography component="span" sx={{ color: "text.secondary" }}>
                          +
                        </Typography>
                      )}
                    </React.Fragment>
                  ))
                )}
              </div>
              {hasConflict && (
                <Typography color="error" variant="body2" sx={{ mb: 0.5 }}>
                  This shortcut conflicts with another custom shortcut
                </Typography>
              )}
              <div className="edit-actions">
                <Button size="small" onClick={handleClear}>
                  Clear
                </Button>
                <Button
                  size="small"
                  onClick={handleCancel}
                  startIcon={<CloseIcon />}
                >
                  Cancel
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleConfirm}
                  disabled={recordedKeys.length === 0 || hasConflict}
                  startIcon={<CheckIcon />}
                >
                  Confirm
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Paper>
  );
};

export default ShortcutRow;
