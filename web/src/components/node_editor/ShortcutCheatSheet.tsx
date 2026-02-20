/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import { memo, useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Chip,
  Tooltip
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import KeyboardDoubleArrowDownIcon from "@mui/icons-material/KeyboardDoubleArrowDown";
import KeyboardDoubleArrowUpIcon from "@mui/icons-material/KeyboardDoubleArrowUp";
import {
  NODE_EDITOR_SHORTCUTS,
  Shortcut,
  SHORTCUT_CATEGORIES,
  expandShortcutsForOS
} from "../../config/shortcuts";
import { isMac } from "../../utils/platform";

interface ShortcutCheatSheetProps {
  open?: boolean;
  onClose?: () => void;
}

/**
 * Keyboard Shortcut Cheat Sheet - A compact, searchable reference panel
 * for all keyboard shortcuts in the node editor.
 *
 * Features:
 * - Collapsible/expandable panel
 * - Search/filter shortcuts by name or key
 * - Group shortcuts by category
 * - OS-aware key display (Mac/Windows)
 * - Quick access toggle button
 */
const ShortcutCheatSheet: React.FC<ShortcutCheatSheetProps> = ({
  open = false,
  onClose
}) => {
  const theme = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<Shortcut["category"] | "all">("all");
  const [isExpanded, setIsExpanded] = useState(true);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus search input when opening
  useEffect(() => {
    if (open && isExpanded && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [open, isExpanded]);

  const os: "mac" | "win" = isMac() ? "mac" : "win";
  const expandedShortcuts = useMemo(
    () => expandShortcutsForOS(NODE_EDITOR_SHORTCUTS, os === "mac"),
    [os]
  );

  // Filter shortcuts based on search and category
  const filteredShortcuts = useMemo(() => {
    return expandedShortcuts.filter((shortcut) => {
      const matchesCategory =
        selectedCategory === "all" || shortcut.category === selectedCategory;
      const matchesSearch =
        searchQuery === "" ||
        shortcut.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        shortcut.keyCombo.some((key) =>
          key.toLowerCase().includes(searchQuery.toLowerCase())
        ) ||
        shortcut.description?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [searchQuery, selectedCategory, expandedShortcuts]);

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

  // Format key combo for display
  const formatKeyCombo = useCallback((combo: string[]): string => {
    return combo
      .map((key) => {
        const normalizedKey = key.toLowerCase();
        switch (normalizedKey) {
          case "control":
            return os === "mac" ? "⌃" : "Ctrl";
          case "meta":
            return "⌘";
          case "alt":
          case "option":
            return os === "mac" ? "⌥" : "Alt";
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
          case "pageup":
            return "PgUp";
          case "pagedown":
            return "PgDn";
          default:
            return key.length === 1 ? key.toUpperCase() : key;
        }
      })
      .join(" + ");
  }, [os]);

  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  }, []);

  const handleCategoryClick = useCallback((category: Shortcut["category"] | "all") => {
    setSelectedCategory(category);
  }, []);

  const handleToggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  // Toggle button (always visible when closed)
  if (!open) {
    return null;
  }

  const styles = css({
    "&.shortcut-cheat-sheet": {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: isExpanded ? "580px" : "auto",
      maxWidth: "90vw",
      maxHeight: isExpanded ? "80vh" : "auto",
      zIndex: 14000,
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: "12px",
      boxShadow: "0 12px 48px rgba(0, 0, 0, 0.4)",
      border: `1px solid ${theme.vars.palette.divider}`,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
    },
    "& .cheat-sheet-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 16px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.action.hover,
      flexShrink: 0
    },
    "& .cheat-sheet-title": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      fontSize: "14px",
      fontWeight: 600,
      color: theme.vars.palette.text.primary
    },
    "& .cheat-sheet-content": {
      display: isExpanded ? "flex" : "none",
      flexDirection: "column",
      overflow: "hidden",
      flex: 1
    },
    "& .cheat-sheet-controls": {
      display: "flex",
      flexDirection: "column",
      gap: "12px",
      padding: "16px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    "& .cheat-sheet-categories": {
      display: "flex",
      flexWrap: "wrap",
      gap: "6px"
    },
    "& .category-chip": {
      fontSize: "11px",
      height: "24px",
      textTransform: "none",
      transition: "all 0.15s ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    "& .cheat-sheet-list": {
      flex: 1,
      overflowY: "auto",
      padding: "0 16px 16px"
    },
    "& .shortcut-category": {
      marginBottom: "16px"
    },
    "& .category-header": {
      fontSize: "12px",
      fontWeight: 600,
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      marginBottom: "8px",
      marginTop: "12px"
    },
    "& .category-header:first-of-type": {
      marginTop: 0
    },
    "& .shortcut-item": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "6px 8px",
      borderRadius: "6px",
      marginBottom: "2px",
      transition: "background-color 0.15s ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    "& .shortcut-name": {
      fontSize: "13px",
      color: theme.vars.palette.text.primary,
      flex: 1,
      paddingRight: "12px"
    },
    "& .shortcut-description": {
      fontSize: "11px",
      color: theme.vars.palette.text.secondary,
      marginTop: "2px"
    },
    "& .shortcut-keys": {
      display: "flex",
      alignItems: "center",
      gap: "4px",
      flexShrink: 0
    },
    "& .key-badge": {
      fontSize: "10px",
      fontWeight: 500,
      fontFamily: "JetBrains Mono, monospace",
      padding: "3px 6px",
      backgroundColor: theme.vars.palette.action.selected,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: "4px",
      color: theme.vars.palette.text.primary,
      whiteSpace: "nowrap"
    },
    "& .empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 20px",
      color: theme.vars.palette.text.secondary,
      textAlign: "center"
    },
    "& .empty-state-icon": {
      fontSize: "48px",
      marginBottom: "12px",
      opacity: 0.5
    },
    "& .empty-state-text": {
      fontSize: "14px"
    },
    "& .search-input": {
      "& .MuiInputBase-input": {
        fontSize: "13px"
      }
    },
    "& .collapse-button": {
      width: "20px",
      height: "20px"
    }
  });

  const categories: Array<{ value: Shortcut["category"] | "all"; label: string }> = [
    { value: "all", label: "All" },
    { value: "editor", label: SHORTCUT_CATEGORIES.editor },
    { value: "workflow", label: SHORTCUT_CATEGORIES.workflow },
    { value: "panel", label: SHORTCUT_CATEGORIES.panel },
    { value: "assets", label: SHORTCUT_CATEGORIES.assets }
  ];

  return (
    <Box className="shortcut-cheat-sheet" css={styles} data-testid="shortcut-cheat-sheet">
      <Box className="cheat-sheet-header">
        <Box className="cheat-sheet-title">
          <HelpOutlineIcon fontSize="small" />
          <Typography variant="body2">Keyboard Shortcuts</Typography>
          <Chip
            label={os === "mac" ? "macOS" : "Win/Linux"}
            size="small"
            sx={{
              height: "18px",
              fontSize: "10px",
              ml: 0.5,
              backgroundColor: theme.vars.palette.action.selected,
              color: theme.vars.palette.text.secondary
            }}
          />
        </Box>
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <Tooltip title={isExpanded ? "Collapse" : "Expand"} arrow>
            <IconButton
              size="small"
              onClick={handleToggleExpand}
              className="collapse-button"
              sx={{ color: "text.secondary" }}
            >
              {isExpanded ? (
                <KeyboardDoubleArrowUpIcon fontSize="small" />
              ) : (
                <KeyboardDoubleArrowDownIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
          {onClose && (
            <Tooltip title="Close" arrow>
              <IconButton
                size="small"
                onClick={onClose}
                sx={{ color: "text.secondary" }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {isExpanded && (
        <Box className="cheat-sheet-content">
          <Box className="cheat-sheet-controls">
            <TextField
              inputRef={searchInputRef}
              placeholder="Search shortcuts..."
              size="small"
              fullWidth
              value={searchQuery}
              onChange={handleSearchChange}
              className="search-input"
              sx={{
                "& .MuiOutlinedInput-root": {
                  fontSize: "13px"
                }
              }}
            />
            <Box className="cheat-sheet-categories">
              {categories.map((cat) => (
                <Chip
                  key={cat.value}
                  label={cat.label}
                  onClick={() => handleCategoryClick(cat.value)}
                  size="small"
                  className="category-chip"
                  variant={selectedCategory === cat.value ? "filled" : "outlined"}
                  color={selectedCategory === cat.value ? "primary" : "default"}
                />
              ))}
            </Box>
          </Box>

          <Box className="cheat-sheet-list">
            {filteredShortcuts.length === 0 ? (
              <Box className="empty-state">
                <HelpOutlineIcon className="empty-state-icon" />
                <Typography className="empty-state-text">
                  No shortcuts found matching &quot;{searchQuery}&quot;
                </Typography>
              </Box>
            ) : (
              <>
                {selectedCategory === "all" ? (
                  // Show grouped by category when "all" is selected
                  Object.entries(groupedShortcuts).map(([category, shortcuts]) => (
                    <Box key={category} className="shortcut-category">
                      <Typography className="category-header">
                        {SHORTCUT_CATEGORIES[category as Shortcut["category"]]}
                      </Typography>
                      {shortcuts.map((shortcut) => (
                        <ShortcutItem
                          key={shortcut.slug}
                          shortcut={shortcut}
                          formatKeyCombo={formatKeyCombo}
                        />
                      ))}
                    </Box>
                  ))
                ) : (
                  // Show flat list when specific category is selected
                  filteredShortcuts.map((shortcut) => (
                    <ShortcutItem
                      key={shortcut.slug}
                      shortcut={shortcut}
                      formatKeyCombo={formatKeyCombo}
                    />
                  ))
                )}
              </>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};

const ShortcutItem: React.FC<{
  shortcut: Shortcut;
  formatKeyCombo: (combo: string[]) => string;
}> = memo(({ shortcut, formatKeyCombo }) => {
  return (
    <Box className="shortcut-item" data-testid={`shortcut-${shortcut.slug}`}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography className="shortcut-name">{shortcut.title}</Typography>
        {shortcut.description && (
          <Typography className="shortcut-description">
            {shortcut.description}
          </Typography>
        )}
      </Box>
      <Box className="shortcut-keys">
        <Typography className="key-badge">{formatKeyCombo(shortcut.keyCombo)}</Typography>
      </Box>
    </Box>
  );
});

ShortcutItem.displayName = "ShortcutItem";

export default memo(ShortcutCheatSheet);
