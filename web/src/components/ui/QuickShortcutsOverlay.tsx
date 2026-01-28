/** @jsxImportSource @emotion/react */
import { useState, useMemo, useCallback, useEffect, Fragment } from "react";
import { css } from "@emotion/react";
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Chip,
  Fade
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import KeyboardIcon from "@mui/icons-material/Keyboard";
import CloseIcon from "@mui/icons-material/Close";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  NODE_EDITOR_SHORTCUTS,
  SHORTCUT_CATEGORIES,
  expandShortcutsForOS,
  type Shortcut
} from "../../config/shortcuts";
import { isMac } from "../../utils/platform";

import type { FC } from "react";

interface QuickShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
}

const styles = (theme: Theme) =>
  css({
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2000,
    backdropFilter: "blur(8px)",
    backgroundColor: "rgba(0, 0, 0, 0.5)",

    ".overlay-content": {
      width: "90%",
      maxWidth: "900px",
      maxHeight: "85vh",
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: theme.vars.rounded.dialog,
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden"
    },

    ".overlay-header": {
      padding: "1.5em 2em 1em",
      borderBottom: `1px solid ${theme.vars.palette.grey[700]}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "1em"
    },

    ".header-left": {
      display: "flex",
      alignItems: "center",
      gap: "0.75em"
    },

    ".header-icon": {
      color: theme.vars.palette.primary.main,
      fontSize: "1.75rem"
    },

    ".header-title": {
      fontSize: "1.5rem",
      fontWeight: 600,
      color: theme.vars.palette.text.primary
    },

    ".close-button": {
      cursor: "pointer",
      padding: "0.5em",
      borderRadius: "50%",
      color: theme.vars.palette.text.secondary,
      transition: "all 0.2s ease",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[800],
        color: theme.vars.palette.text.primary
      }
    },

    ".search-section": {
      padding: "1em 2em"
    },

    ".categories-filter": {
      display: "flex",
      gap: "0.5em",
      marginTop: "1em",
      flexWrap: "wrap"
    },

    ".shortcuts-content": {
      flex: 1,
      overflowY: "auto",
      padding: "0 2em 2em",
      "&::-webkit-scrollbar": {
        width: "8px"
      },
      "&::-webkit-scrollbar-track": {
        background: theme.vars.palette.grey[900]
      },
      "&::-webkit-scrollbar-thumb": {
        background: theme.vars.palette.grey[600],
        borderRadius: "4px"
      },
      "&::-webkit-scrollbar-thumb:hover": {
        background: theme.vars.palette.grey[500]
      }
    },

    ".category-section": {
      marginBottom: "2em"
    },

    ".category-title": {
      fontSize: "1.125rem",
      fontWeight: 600,
      color: theme.vars.palette.primary.main,
      marginBottom: "1em",
      paddingBottom: "0.5em",
      borderBottom: `1px solid ${theme.vars.palette.grey[800]}`
    },

    ".shortcut-row": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0.75em 1em",
      marginBottom: "0.5em",
      borderRadius: "8px",
      backgroundColor: theme.vars.palette.grey[900],
      transition: "all 0.2s ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[800],
        transform: "translateX(4px)"
      }
    },

    ".shortcut-info": {
      display: "flex",
      flexDirection: "column",
      gap: "0.25em",
      flex: 1
    },

    ".shortcut-title": {
      fontSize: "0.95rem",
      fontWeight: 500,
      color: theme.vars.palette.text.primary
    },

    ".shortcut-description": {
      fontSize: "0.8rem",
      color: theme.vars.palette.text.secondary
    },

    ".shortcut-keys": {
      display: "flex",
      gap: "0.25em",
      alignItems: "center"
    },

    ".key": {
      padding: "0.25em 0.5em",
      backgroundColor: theme.vars.palette.grey[700],
      border: `1px solid ${theme.vars.palette.grey[600]}`,
      borderRadius: "4px",
      fontSize: "0.85rem",
      fontWeight: 500,
      color: theme.vars.palette.text.primary,
      minWidth: "2em",
      textAlign: "center",
      boxShadow: "0 2px 0 rgba(0, 0, 0, 0.2)"
    },

    ".key-separator": {
      color: theme.vars.palette.text.secondary,
      fontSize: "0.85rem"
    },

    ".no-results": {
      textAlign: "center",
      padding: "3em",
      color: theme.vars.palette.text.secondary
    }
  });

const QuickShortcutsOverlay: FC<QuickShortcutsOverlayProps> = ({
  open,
  onClose
}) => {
  const theme = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const mac = isMac();
  const expandedShortcuts = useMemo(
    () => expandShortcutsForOS(NODE_EDITOR_SHORTCUTS, mac),
    [mac]
  );

  // Filter shortcuts based on search and category
  const filteredShortcuts = useMemo(() => {
    let filtered = expandedShortcuts;

    // Filter by category
    if (selectedCategory !== "all") {
      filtered = filtered.filter((s) => s.category === selectedCategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.title.toLowerCase().includes(query) ||
          s.description?.toLowerCase().includes(query) ||
          s.keyCombo.some((k) => k.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [expandedShortcuts, searchQuery, selectedCategory]);

  // Group shortcuts by category
  const groupedShortcuts = useMemo(() => {
    const groups: Record<string, Shortcut[]> = {};
    filteredShortcuts.forEach((shortcut) => {
      if (!groups[shortcut.category]) {
        groups[shortcut.category] = [];
      }
      groups[shortcut.category].push(shortcut);
    });
    return groups;
  }, [filteredShortcuts]);

  // Format key for display
  const formatKey = useCallback(
    (key: string): string => {
      switch (key.toLowerCase()) {
        case "control":
          return mac ? "Ctrl" : "Ctrl";
        case "meta":
          return mac ? "⌘" : "Win";
        case "alt":
          return mac ? "⌥" : "Alt";
        case "option":
          return mac ? "⌥" : "Opt";
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
          return "Esc";
        case "delete":
          return "Del";
        case "backspace":
          return mac ? "⌫" : "Backspace";
        case "enter":
          return "↵";
        case "tab":
          return "⇥";
        default:
          return key.length === 1 ? key.toUpperCase() : key;
      }
    },
    [mac]
  );

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!open) {return;}

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) {return null;}

  const categories = [
    { value: "all", label: "All" },
    ...Object.entries(SHORTCUT_CATEGORIES).map(([key, label]) => ({
      value: key,
      label
    }))
  ];

  return (
    <Fade in={open}>
      <Box css={styles(theme)} onClick={onClose}>
        <Box
          className="overlay-content"
          onClick={(e) => e.stopPropagation()}
        >
          <Box className="overlay-header">
            <Box className="header-left">
              <KeyboardIcon className="header-icon" />
              <Typography className="header-title">
                Keyboard Shortcuts
              </Typography>
            </Box>
            <Box className="close-button" onClick={onClose}>
              <CloseIcon />
            </Box>
          </Box>

          <Box className="search-section">
            <TextField
              fullWidth
              placeholder="Search shortcuts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                )
              }}
            />
            <Box className="categories-filter">
              {categories.map((cat) => (
                <Chip
                  key={cat.value}
                  label={cat.label}
                  onClick={() => setSelectedCategory(cat.value)}
                  color={selectedCategory === cat.value ? "primary" : "default"}
                  variant={selectedCategory === cat.value ? "filled" : "outlined"}
                />
              ))}
            </Box>
          </Box>

          <Box className="shortcuts-content">
            {Object.keys(groupedShortcuts).length === 0 ? (
              <Box className="no-results">
                <Typography variant="h6">No shortcuts found</Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Try adjusting your search or filter
                </Typography>
              </Box>
            ) : (
              Object.entries(groupedShortcuts).map(([category, shortcuts]) => (
                <Box key={category} className="category-section">
                  <Typography className="category-title">
                    {SHORTCUT_CATEGORIES[category as keyof typeof SHORTCUT_CATEGORIES]}
                  </Typography>
                  {shortcuts.map((shortcut) => (
                    <Box key={shortcut.slug} className="shortcut-row">
                      <Box className="shortcut-info">
                        <Typography className="shortcut-title">
                          {shortcut.title}
                        </Typography>
                        {shortcut.description && (
                          <Typography className="shortcut-description">
                            {shortcut.description}
                          </Typography>
                        )}
                      </Box>
                      <Box className="shortcut-keys">
                        {shortcut.keyCombo.map((key, idx) => (
                          <Fragment key={`${shortcut.slug}-${idx}`}>
                            <Box className="key">{formatKey(key)}</Box>
                            {idx < shortcut.keyCombo.length - 1 && (
                              <span className="key-separator">+</span>
                            )}
                          </Fragment>
                        ))}
                      </Box>
                    </Box>
                  ))}
                </Box>
              ))
            )}
          </Box>
        </Box>
      </Box>
    </Fade>
  );
};

export default QuickShortcutsOverlay;
