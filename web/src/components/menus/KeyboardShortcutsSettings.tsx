/** @jsxImportSource @emotion/react */
import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  Alert,
  Chip,
  IconButton,
  Tooltip,
  Collapse
} from "@mui/material";
import {
  KeyboardArrowDown,
  KeyboardArrowUp,
  Restore,
  Warning
} from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import { useKeyboardShortcutsStore } from "../../stores/KeyboardShortcutsStore";
import {
  SHORTCUT_CATEGORIES,
  type Shortcut
} from "../../config/shortcuts";
import { isMac } from "../../utils/platform";
import { styled } from "@mui/material/styles";

interface KeyComboDisplayProps {
  keys: string[];
  isEditing?: boolean;
  hasConflict?: boolean;
  onClick?: () => void;
}

const KeyComboChip = styled(Chip, {
  shouldForwardProp: (prop) => prop !== "hasConflict"
})<{ hasConflict?: boolean }>(({ theme, hasConflict }) => ({
  backgroundColor: hasConflict
    ? `rgba(${theme.vars.palette.error.mainChannel} / 0.15)`
    : `rgba(${theme.vars.palette.primary.mainChannel} / 0.12)`,
  color: hasConflict
    ? theme.vars.palette.error.main
    : theme.vars.palette.primary.main,
  border: hasConflict
    ? `1px solid ${theme.vars.palette.error.main}`
    : `1px solid ${theme.vars.palette.primary.main}`,
  fontWeight: 500,
  fontFamily: "monospace",
  fontSize: theme.fontSizeSmaller,
  margin: "2px"
}));

const KeyComboDisplay: React.FC<KeyComboDisplayProps> = ({
  keys,
  isEditing = false,
  hasConflict = false,
  onClick
}) => {
  const theme = useTheme();

  const humanizeKey = (key: string): string => {
    switch (key.toLowerCase()) {
      case "control":
        return isMac() ? "⌘" : "Ctrl";
      case "meta":
        return "⌘";
      case "alt":
        return isMac() ? "⌥" : "Alt";
      case "option":
        return "⌥";
      case "shift":
        return "⇧";
      case " ":
      case "space":
        return "Space";
      case "arrowup":
        return "↑";
      case "arrowdown":
        return "↓";
      case "arrowleft":
        return "←";
      case "arrowright":
        return "→";
      case "escape":
      case "esc":
        return "Esc";
      case "enter":
        return "↵";
      case "delete":
        return "Del";
      case "backspace":
        return "⌫";
      case "tab":
        return "Tab";
      default:
        return key.length === 1 ? key.toUpperCase() : key;
    }
  };

  if (isEditing) {
    return (
      <Box
        onClick={onClick}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.5,
          padding: "4px 12px",
          border: `2px dashed ${theme.vars.palette.primary.main}`,
          borderRadius: "8px",
          cursor: "pointer",
          backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.05)`,
          minWidth: "100px",
          minHeight: "36px",
          justifyContent: "center"
        }}
      >
        <Typography
          variant="body2"
          sx={{
            color: theme.vars.palette.primary.main,
            fontStyle: "italic",
            fontWeight: 500
          }}
        >
          Press keys...
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      onClick={onClick}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 0.5,
        cursor: "pointer",
        padding: "2px"
      }}
    >
      {keys.map((key, idx) => (
        <React.Fragment key={`${key}-${idx}`}>
          <KeyComboChip
            label={humanizeKey(key)}
            size="small"
            hasConflict={hasConflict}
          />
          {idx < keys.length - 1 && (
            <Typography
              variant="body2"
              sx={{ color: theme.vars.palette.grey[100], margin: "0 2px" }}
            >
              +
            </Typography>
          )}
        </React.Fragment>
      ))}
    </Box>
  );
};

interface ShortcutRowProps {
  shortcut: Shortcut;
  isCustom: boolean;
}

const ShortcutRow: React.FC<ShortcutRowProps> = ({ shortcut, isCustom }) => {
  const theme = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedKeys, setRecordedKeys] = useState<string[]>([]);
  const [conflict, setConflict] = useState<string | null>(null);

  const { setCustomShortcut, removeCustomShortcut, hasConflict, getShortcutCombo } =
    useKeyboardShortcutsStore();

  const currentCombo = getShortcutCombo(shortcut.slug);
  const [_originalCombo, setOriginalCombo] = useState<string[]>(currentCombo);

  // Update original combo when shortcut changes externally
  useEffect(() => {
    setOriginalCombo(currentCombo);
  }, [shortcut.slug, currentCombo]);

  const handleStartRecording = useCallback(() => {
    setIsRecording(true);
    setRecordedKeys([]);
    setConflict(null);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const keys: string[] = [];
      if (e.ctrlKey) {
        keys.push("control");
      }
      if (e.metaKey) {
        keys.push("meta");
      }
      if (e.shiftKey) {
        keys.push("shift");
      }
      if (e.altKey) {
        keys.push("alt");
      }

      // Add the non-modifier key
      if (
        e.key !== "Control" &&
        e.key !== "Meta" &&
        e.key !== "Shift" &&
        e.key !== "Alt"
      ) {
        keys.push(e.key);
      }

      // Require at least one non-modifier key
      const hasNonModifier = keys.some(
        (k) => !["control", "meta", "shift", "alt"].includes(k)
      );

      if (!hasNonModifier) {
        return; // Wait for a non-modifier key
      }

      setRecordedKeys(keys);
    },
    []
  );

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (recordedKeys.length > 0) {
        // Check for conflicts
        const conflictingShortcut = hasConflict(
          shortcut.slug,
          recordedKeys,
          shortcut.category
        );

        if (conflictingShortcut) {
          const allShortcuts = useKeyboardShortcutsStore
            .getState()
            .getAllShortcuts();
          const conflictInfo = allShortcuts.find(
            (s) =>
              hasConflict(shortcut.slug, recordedKeys, shortcut.category) &&
              s.slug !== shortcut.slug
          );
          setConflict(
            `Conflicts with "${conflictInfo?.title || "another shortcut"}"`
          );
        } else {
          // No conflict, save the shortcut
          setCustomShortcut(shortcut.slug, recordedKeys);
          setIsRecording(false);
          setRecordedKeys([]);
        }
      }
    },
    [recordedKeys, shortcut, hasConflict, setCustomShortcut]
  );

  const handleCancelRecording = useCallback(() => {
    setIsRecording(false);
    setRecordedKeys([]);
    setConflict(null);
  }, []);

  const handleResetShortcut = useCallback(() => {
    removeCustomShortcut(shortcut.slug);
    setConflict(null);
  }, [shortcut.slug, removeCustomShortcut]);

  return (
    <Box
      sx={{
        borderBottom: `1px solid ${theme.vars.palette.divider}`,
        padding: "1em 0",
        "&:last-child": {
          borderBottom: "none"
        }
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              marginBottom: 0.5
            }}
          >
            <Typography
              variant="body1"
              sx={{
                fontWeight: 500,
                color: theme.vars.palette.grey[0]
              }}
            >
              {shortcut.title}
            </Typography>
            {isCustom && (
              <Chip
                label="Custom"
                size="small"
                sx={{
                  backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.15)`,
                  color: theme.vars.palette.primary.main,
                  fontSize: theme.fontSizeSmaller,
                  height: 20
                }}
              />
            )}
          </Box>
          {shortcut.description && (
            <Typography
              variant="body2"
              sx={{
                color: theme.vars.palette.grey[100],
                fontSize: theme.fontSizeSmaller,
                lineHeight: 1.4
              }}
            >
              {shortcut.description}
            </Typography>
          )}
        </Box>

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexShrink: 0
          }}
        >
          {isRecording ? (
            <Box
              tabIndex={0}
              onKeyDown={handleKeyDown}
              onKeyUp={handleKeyUp}
              onBlur={handleCancelRecording}
              sx={{ outline: "none" }}
            >
              <KeyComboDisplay keys={recordedKeys} isEditing />
            </Box>
          ) : (
            <KeyComboDisplay
              keys={currentCombo}
              hasConflict={conflict !== null}
              onClick={handleStartRecording}
            />
          )}

          {isCustom && !isRecording && (
            <Tooltip title="Reset to default">
              <IconButton
                size="small"
                onClick={handleResetShortcut}
                sx={{
                  color: theme.vars.palette.grey[100],
                  "&:hover": {
                    color: theme.vars.palette.warning.main
                  }
                }}
              >
                <Restore fontSize="small" />
              </IconButton>
            </Tooltip>
          )}

          <IconButton
            size="small"
            onClick={() => setIsExpanded(!isExpanded)}
            sx={{
              color: theme.vars.palette.grey[100]
            }}
          >
            {isExpanded ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
          </IconButton>
        </Box>
      </Box>

      <Collapse in={isExpanded || conflict !== null}>
        <Box
          sx={{
            marginTop: 1,
            padding: 1,
            backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.5)`,
            borderRadius: 1
          }}
        >
          <Typography
            variant="body2"
            sx={{
              color: theme.vars.palette.grey[100],
              fontSize: theme.fontSizeSmaller,
              marginBottom: 1
            }}
          >
            Category: {SHORTCUT_CATEGORIES[shortcut.category]}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: theme.vars.palette.grey[100],
              fontSize: theme.fontSizeSmaller
            }}
          >
            Default:{" "}
            <KeyComboDisplay keys={shortcut.keyCombo} />
          </Typography>
          {shortcut.altKeyCombos && shortcut.altKeyCombos.length > 0 && (
            <Typography
              variant="body2"
              sx={{
                color: theme.vars.palette.grey[100],
                fontSize: theme.fontSizeSmaller,
                marginTop: 0.5
              }}
            >
              Alternatives:{" "}
              {shortcut.altKeyCombos.map((combo, idx) => (
                <KeyComboDisplay
                  key={idx}
                  keys={combo}

                />
              ))}
            </Typography>
          )}
        </Box>
      </Collapse>

      {conflict && (
        <Alert
          severity="warning"
          sx={{
            marginTop: 1,
            fontSize: theme.fontSizeSmaller
          }}
          icon={<Warning fontSize="small" />}
        >
          {conflict}. Press different keys to resolve.
        </Alert>
      )}
    </Box>
  );
};

interface KeyboardShortcutsSettingsProps {
  searchQuery?: string;
  selectedCategory?: string;
}

const KeyboardShortcutsSettings: React.FC<KeyboardShortcutsSettingsProps> = ({
  searchQuery = "",
  selectedCategory
}) => {
  const theme = useTheme();
  const { resetToDefaults, getAllShortcuts } = useKeyboardShortcutsStore();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const allShortcuts = useMemo(() => getAllShortcuts(), [getAllShortcuts]);

  const filteredShortcuts = useMemo(() => {
    let filtered = allShortcuts;

    // Filter by category
    if (selectedCategory) {
      filtered = filtered.filter((s) => s.category === selectedCategory);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.title.toLowerCase().includes(query) ||
          s.description?.toLowerCase().includes(query) ||
          s.slug.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [allShortcuts, searchQuery, selectedCategory]);

  const customSlugs = useMemo(() => {
    const custom = useKeyboardShortcutsStore.getState().customShortcuts;
    return new Set(Object.keys(custom));
  }, []);

  const handleResetAll = useCallback(() => {
    resetToDefaults();
    setShowResetConfirm(false);
  }, [resetToDefaults]);

  // Group shortcuts by category
  const shortcutsByCategory = useMemo(() => {
    const grouped: Record<string, Shortcut[]> = {};
    filteredShortcuts.forEach((shortcut) => {
      const category = SHORTCUT_CATEGORIES[shortcut.category];
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(shortcut);
    });
    return grouped;
  }, [filteredShortcuts]);

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 2,
          paddingBottom: 1,
          borderBottom: `1px solid ${theme.vars.palette.divider}`
        }}
      >
        <Box>
          <Typography
            variant="h6"
            sx={{
              color: theme.vars.palette.grey[0],
              fontWeight: 500,
              marginBottom: 0.5
            }}
          >
            Keyboard Shortcuts
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: theme.vars.palette.grey[100],
              fontSize: theme.fontSizeSmaller
            }}
          >
            Click on a key combination to record a new shortcut. Custom shortcuts
            are highlighted.
          </Typography>
        </Box>

        {!showResetConfirm ? (
          <Button
            variant="outlined"
            color="warning"
            size="small"
            onClick={() => setShowResetConfirm(true)}
            sx={{
              borderColor: theme.vars.palette.warning.main,
              color: theme.vars.palette.warning.main
            }}
          >
            Reset All
          </Button>
        ) : (
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button size="small" onClick={() => setShowResetConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="contained"
              color="warning"
              size="small"
              onClick={handleResetAll}
              startIcon={<Restore />}
            >
              Confirm Reset
            </Button>
          </Box>
        )}
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto" }}>
        {Object.entries(shortcutsByCategory).map(([category, shortcuts]) => (
          <Box key={category} sx={{ marginBottom: 2 }}>
            <Typography
              variant="subtitle2"
              sx={{
                color: theme.vars.palette.primary.main,
                fontWeight: 600,
                textTransform: "uppercase",
                fontSize: theme.fontSizeSmaller,
                letterSpacing: "0.05em",
                marginBottom: 1,
                marginTop: 2
              }}
            >
              {category}
            </Typography>
            <Box
              sx={{
                backgroundColor: theme.vars.palette.background.paper,
                borderRadius: 1,
                border: `1px solid ${theme.vars.palette.divider}`,
                padding: "0 1em"
              }}
            >
              {shortcuts.map((shortcut) => (
                <ShortcutRow
                  key={shortcut.slug}
                  shortcut={shortcut}
                  isCustom={customSlugs.has(shortcut.slug)}
                />
              ))}
            </Box>
          </Box>
        ))}

        {filteredShortcuts.length === 0 && (
          <Box
            sx={{
              textAlign: "center",
              padding: 4,
              color: theme.vars.palette.grey[100]
            }}
          >
            <Typography variant="body2">
              {searchQuery
                ? "No shortcuts match your search."
                : "No shortcuts available."}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default KeyboardShortcutsSettings;
