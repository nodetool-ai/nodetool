/** @jsxImportSource @emotion/react */
import React, { useState, useMemo } from "react";
import { css } from "@emotion/react";
import { Box, Typography, ToggleButton, ToggleButtonGroup } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  NODE_EDITOR_SHORTCUTS,
  SHORTCUT_CATEGORIES,
  Shortcut
} from "../../../config/shortcuts";
import { isMac } from "../../../utils/platform";

/**
 * Helper to humanize key names for display
 */
const humanizeKey = (key: string, os: "mac" | "win"): string => {
  switch (key.toLowerCase()) {
    case "control":
      return os === "mac" ? "⌃" : "CTRL";
    case "meta":
      return os === "mac" ? "⌘" : "WIN";
    case "alt":
      return os === "mac" ? "⌥" : "ALT";
    case "option":
      return "⌥";
    case "shift":
      return "⇧";
    case " ":
    case "space":
      return "SPACE";
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
      return "ESC";
    case "enter":
      return "⏎";
    case "backspace":
      return "⌫";
    case "delete":
      return "DEL";
    case "tab":
      return "TAB";
    case "pageup":
      return "PGUP";
    case "pagedown":
      return "PGDN";
    case "mouseright":
      return "🖱R";
    default:
      return key.length === 1 ? key.toUpperCase() : key.toUpperCase();
  }
};

/**
 * Map keys to macOS equivalents
 */
const mapKeyForMac = (key: string): string => {
  switch (key) {
    case "Alt":
      return "Option";
    case "Control":
      return "Meta";
    default:
      return key;
  }
};

/**
 * Get the key combo for a shortcut based on OS
 */
const getKeyComboForOS = (shortcut: Shortcut, os: "mac" | "win"): string[] => {
  if (os === "mac") {
    return shortcut.keyComboMac ?? shortcut.keyCombo.map(mapKeyForMac);
  }
  return shortcut.keyCombo;
};

const gridStyles = (theme: Theme) =>
  css({
    ".shortcuts-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: "1.5rem",
      width: "100%",
      height: "100%"
    },
    ".category-section": {
      display: "flex",
      flexDirection: "column",
      gap: "0.25rem"
    },
    ".category-title": {
      fontSize: "0.9rem",
      fontWeight: 600,
      color: theme.vars.palette.primary.main,
      marginBottom: "0.5rem",
      borderBottom: `1px solid ${theme.vars.palette.grey[700]}`,
      paddingBottom: "0.25rem"
    },
    ".shortcut-row": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "0.5rem",
      padding: "0.15rem 0",
      fontSize: "0.75rem",
      borderRadius: "4px",
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[800]
      }
    },
    ".shortcut-title": {
      flex: 1,
      color: theme.vars.palette.grey[200],
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      fontSize: "0.75rem"
    },
    ".shortcut-keys": {
      display: "flex",
      gap: "0.15rem",
      alignItems: "center",
      flexShrink: 0
    },
    ".key": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: "20px",
      padding: "0.1rem 0.35rem",
      fontSize: "0.65rem",
      fontWeight: 600,
      borderRadius: "3px",
      backgroundColor: theme.vars.palette.grey[700],
      color: theme.vars.palette.grey[100],
      border: `1px solid ${theme.vars.palette.grey[600]}`,
      boxShadow: `0 1px 0 ${theme.vars.palette.grey[800]}`,
      whiteSpace: "nowrap"
    },
    ".key-plus": {
      color: theme.vars.palette.grey[500],
      fontSize: "0.6rem",
      margin: "0 0.05rem"
    },
    ".os-toggle": {
      marginBottom: "1rem",
      display: "flex",
      justifyContent: "center"
    },
    ".toggle-button": {
      fontSize: "0.8rem !important",
      padding: "4px 12px !important"
    }
  });

interface KeyboardShortcutsGridProps {
  shortcuts?: Shortcut[];
}

/**
 * A compact grid view showing all keyboard shortcuts at once, organized by category.
 * Designed to fit all shortcuts on a single fullscreen page without scrolling.
 */
const KeyboardShortcutsGrid: React.FC<KeyboardShortcutsGridProps> = ({
  shortcuts = NODE_EDITOR_SHORTCUTS
}) => {
  const theme = useTheme();
  const [os, setOs] = useState<"mac" | "win">(isMac() ? "mac" : "win");

  // Group shortcuts by category
  const groupedShortcuts = useMemo(() => {
    const groups: Record<Shortcut["category"], Shortcut[]> = {
      editor: [],
      workflow: [],
      panel: [],
      assets: []
    };

    // Filter out duplicates (same title, different key combos like deleteNode/deleteNodeBackspace)
    const seen = new Set<string>();
    shortcuts.forEach((s) => {
      // Skip if we've already seen this title (avoid duplicates)
      if (seen.has(s.title)) {return;}
      seen.add(s.title);
      groups[s.category].push(s);
    });

    return groups;
  }, [shortcuts]);

  const handleOsToggle = (
    _: React.MouseEvent<HTMLElement>,
    value: "mac" | "win" | null
  ) => {
    if (value) {
      setOs(value);
    }
  };

  const renderKeyCombo = (shortcut: Shortcut) => {
    const combo = getKeyComboForOS(shortcut, os);
    return (
      <span className="shortcut-keys">
        {combo.map((key, idx) => (
          <React.Fragment key={idx}>
            <span className="key">{humanizeKey(key, os)}</span>
            {idx < combo.length - 1 && <span className="key-plus">+</span>}
          </React.Fragment>
        ))}
      </span>
    );
  };

  const renderShortcutRow = (shortcut: Shortcut) => (
    <div key={shortcut.slug} className="shortcut-row" title={shortcut.description}>
      <span className="shortcut-title">{shortcut.title}</span>
      {renderKeyCombo(shortcut)}
    </div>
  );

  // Split editor shortcuts into two columns since there are many
  const editorShortcuts = groupedShortcuts.editor;
  const editorMid = Math.ceil(editorShortcuts.length / 2);
  const editorCol1 = editorShortcuts.slice(0, editorMid);
  const editorCol2 = editorShortcuts.slice(editorMid);

  return (
    <Box css={gridStyles(theme)} sx={{ height: "100%", overflow: "hidden" }}>
      <Box className="os-toggle">
        <ToggleButtonGroup
          value={os}
          exclusive
          onChange={handleOsToggle}
          size="small"
        >
          <ToggleButton value="mac" className="toggle-button">
            macOS
          </ToggleButton>
          <ToggleButton value="win" className="toggle-button">
            Windows / Linux
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box className="shortcuts-grid" data-testid="shortcuts-grid">
        {/* Editor shortcuts - split into two columns */}
        <Box className="category-section">
          <Typography className="category-title">
            {SHORTCUT_CATEGORIES.editor} (1/2)
          </Typography>
          {editorCol1.map(renderShortcutRow)}
        </Box>

        <Box className="category-section">
          <Typography className="category-title">
            {SHORTCUT_CATEGORIES.editor} (2/2)
          </Typography>
          {editorCol2.map(renderShortcutRow)}
        </Box>

        {/* Workflow shortcuts */}
        <Box className="category-section">
          <Typography className="category-title">
            {SHORTCUT_CATEGORIES.workflow}
          </Typography>
          {groupedShortcuts.workflow.map(renderShortcutRow)}
          
          {/* Add Panels in the same column to save space */}
          <Typography className="category-title" sx={{ mt: 2 }}>
            {SHORTCUT_CATEGORIES.panel}
          </Typography>
          {groupedShortcuts.panel.map(renderShortcutRow)}
        </Box>

        {/* Quick reference legends */}
        <Box className="category-section">
          <Typography className="category-title">Key Legend</Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.7rem", color: "grey.300" }}>
            <div className="shortcut-row">
              <span className="shortcut-title">Control / Command</span>
              <span className="shortcut-keys">
                <span className="key">{os === "mac" ? "⌘" : "CTRL"}</span>
              </span>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-title">Alt / Option</span>
              <span className="shortcut-keys">
                <span className="key">{os === "mac" ? "⌥" : "ALT"}</span>
              </span>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-title">Shift</span>
              <span className="shortcut-keys">
                <span className="key">⇧</span>
              </span>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-title">Enter / Return</span>
              <span className="shortcut-keys">
                <span className="key">⏎</span>
              </span>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-title">Arrow Keys</span>
              <span className="shortcut-keys">
                <span className="key">↑</span>
                <span className="key">↓</span>
                <span className="key">←</span>
                <span className="key">→</span>
              </span>
            </div>
          </Box>

          {/* Assets if any */}
          {groupedShortcuts.assets.length > 0 && (
            <>
              <Typography className="category-title" sx={{ mt: 2 }}>
                {SHORTCUT_CATEGORIES.assets}
              </Typography>
              {groupedShortcuts.assets.map(renderShortcutRow)}
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default KeyboardShortcutsGrid;
