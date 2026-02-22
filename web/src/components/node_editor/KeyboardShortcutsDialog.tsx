/** @jsxImportSource @emotion/react */
/**
 * KeyboardShortcutsDialog
 *
 * A lightweight, searchable dialog for quickly viewing keyboard shortcuts.
 * Designed for fast access via a keyboard shortcut (e.g., Ctrl+K or ?).
 * Features category filtering, fuzzy search, and OS-specific key display.
 *
 * @example
 * // Basic usage
 * <KeyboardShortcutsDialog open={open} onClose={handleClose} />
 *
 * @example
 * // With specific shortcuts
 * <KeyboardShortcutsDialog
 *   open={open}
 *   onClose={handleClose}
 *   shortcuts={WORKFLOW_SHORTCUTS}
 * />
 */

import { css } from "@emotion/react";
import { useTheme, type Theme } from "@mui/material/styles";
import {
  memo,
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef
} from "react";
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  ToggleButtonGroup,
  ToggleButton,
  List,
  ListItem,
  Chip
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { CloseButton } from "../ui_primitives/CloseButton";
import {
  Shortcut,
  SHORTCUT_CATEGORIES,
  expandShortcutsForOS
} from "../../config/shortcuts";
import { NODE_EDITOR_SHORTCUTS } from "../../config/shortcuts";
import { isMac } from "../../utils/platform";

const styles = (theme: Theme) =>
  css({
    "&.keyboard-shortcuts-dialog": {
      display: "flex",
      flexDirection: "column",
      maxHeight: "70vh",
      minWidth: "600px",
      maxWidth: "900px"
    },
    "& .dialog-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: theme.spacing(2, 3),
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    "& .dialog-title": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      margin: 0,
      fontSize: "1.25rem",
      fontWeight: 600
    },
    "& .dialog-controls": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(2),
      padding: theme.spacing(2, 3)
    },
    "& .search-field": {
      flex: 1,
      "& .MuiInputBase-root": {
        borderRadius: "8px"
      }
    },
    "& .os-toggle": {
      textTransform: "none",
      fontWeight: 500,
      fontSize: "0.875rem"
    },
    "& .category-chips": {
      display: "flex",
      gap: theme.spacing(1),
      padding: theme.spacing(1, 3),
      flexWrap: "wrap",
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    "& .category-chip": {
      fontSize: "0.75rem",
      height: "28px",
      borderRadius: "14px",
      transition: "all 0.2s ease",
      "&.Mui-selected": {
        backgroundColor: theme.vars.palette.primary.main,
        color: theme.vars.palette.primary.contrastText
      },
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    "& .shortcuts-list": {
      flex: 1,
      overflowY: "auto",
      padding: 0
    },
    "& .shortcuts-list::-webkit-scrollbar": {
      width: "8px"
    },
    "& .shortcuts-list::-webkit-scrollbar-track": {
      background: "transparent"
    },
    "& .shortcuts-list::-webkit-scrollbar-thumb": {
      background: theme.vars.palette.grey[600],
      borderRadius: "4px"
    },
    "& .shortcuts-list::-webkit-scrollbar-thumb:hover": {
      background: theme.vars.palette.grey[500]
    },
    "& .category-section": {
      "& .category-header": {
        position: "sticky",
        top: 0,
        zIndex: 1,
        backgroundColor: theme.vars.palette.background.paper,
        padding: theme.spacing(2, 3, 1),
        borderBottom: `1px solid ${theme.vars.palette.divider}`,
        "& .category-title": {
          fontSize: "0.875rem",
          fontWeight: 600,
          color: theme.vars.palette.text.secondary,
          textTransform: "uppercase",
          letterSpacing: "0.05em"
        },
        "& .category-count": {
          marginLeft: theme.spacing(1),
          fontSize: "0.75rem",
          color: theme.vars.palette.text.disabled
        }
      }
    },
    "& .shortcut-item": {
      padding: theme.spacing(1.5, 3),
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      transition: "background-color 0.15s ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      },
      "&:last-child": {
        borderBottom: "none"
      }
    },
    "& .shortcut-content": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing(2)
    },
    "& .shortcut-info": {
      flex: 1,
      minWidth: 0
    },
    "& .shortcut-title": {
      fontSize: "0.875rem",
      fontWeight: 500,
      marginBottom: theme.spacing(0.25)
    },
    "& .shortcut-description": {
      fontSize: "0.75rem",
      color: theme.vars.palette.text.secondary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    "& .shortcut-keys": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.5),
      flexShrink: 0
    },
    "& .key-badge": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: "28px",
      height: "28px",
      padding: theme.spacing(0, 1),
      fontSize: "0.75rem",
      fontWeight: 600,
      fontFamily: "monospace",
      backgroundColor: theme.vars.palette.action.selected,
      borderRadius: "4px",
      border: `1px solid ${theme.vars.palette.divider}`
    },
    "& .key-separator": {
      fontSize: "0.75rem",
      color: theme.vars.palette.text.disabled,
      margin: "0 2px"
    },
    "& .empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: theme.spacing(8, 3),
      color: theme.vars.palette.text.secondary
    },
    "& .empty-icon": {
      fontSize: "48px",
      marginBottom: theme.spacing(2),
      opacity: 0.5
    },
    "& .empty-text": {
      fontSize: "0.875rem",
      textAlign: "center"
    },
    "& .highlight": {
      backgroundColor: theme.vars.palette.warning.main,
      color: theme.vars.palette.warning.contrastText,
      borderRadius: "2px",
      padding: "0 2px"
    }
  });

interface KeyboardShortcutsDialogProps {
  /**
   * Whether the dialog is open
   */
  open: boolean;
  /**
   * Callback when the dialog is closed
   */
  onClose: () => void;
  /**
   * Optional custom shortcuts to display
   * @default NODE_EDITOR_SHORTCUTS
   */
  shortcuts?: Shortcut[];
  /**
   * Initial category filter
   * @default "all"
   */
  initialCategory?: Shortcut["category"] | "all";
}

/**
 * Formats a key combination for display in a key badge.
 * Converts special keys to their display format (e.g., "control" -> "CTRL").
 */
const formatKey = (key: string): string => {
  const normalized = key.toLowerCase();
  switch (normalized) {
    case "control":
      return "CTRL";
    case "meta":
      return "⌘";
    case "alt":
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
    case "tab":
      return "⇥";
    case "delete":
      return "DEL";
    case "pageup":
      return "PgUp";
    case "pagedown":
      return "PgDn";
    default:
      return key.length === 1 ? key.toUpperCase() : key;
  }
};

/**
 * Highlights matching text within a string by wrapping it in a span with highlight class.
 */
const highlightMatch = (
  text: string,
  query: string,
  theme: Theme
): React.ReactNode => {
  if (!query) {
    return text;
  }

  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, index) =>
        regex.test(part) ? (
          <span key={index} className="highlight" css={{ backgroundColor: theme.vars.palette.warning.main, color: theme.vars.palette.warning.contrastText, borderRadius: "2px", padding: "0 2px" }}>
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
};

/**
 * KeyboardShortcutsDialog Component
 *
 * A searchable, filterable dialog for viewing keyboard shortcuts.
 * Provides quick access to all available shortcuts with category filtering
 * and OS-specific key combinations.
 */
const KeyboardShortcutsDialog: React.FC<KeyboardShortcutsDialogProps> = memo(
  ({ open, onClose, shortcuts = NODE_EDITOR_SHORTCUTS, initialCategory = "all" }) => {
    const theme = useTheme();
    const inputRef = useRef<HTMLInputElement>(null);

    const [os, setOs] = useState<"mac" | "win">(isMac() ? "mac" : "win");
    const [categoryFilter, setCategoryFilter] = useState<
      "all" | Shortcut["category"]
    >(initialCategory);
    const [searchQuery, setSearchQuery] = useState("");

    // Auto-focus search input when dialog opens
    useEffect(() => {
      if (open) {
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    }, [open]);

    // Reset state when dialog closes
    useEffect(() => {
      if (!open) {
        setSearchQuery("");
        setCategoryFilter(initialCategory);
      }
    }, [open, initialCategory]);

    // Handle Escape key to close dialog
    useEffect(() => {
      if (!open) {
        return;
      }

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [open, onClose]);

    // Expand shortcuts for current OS
    const expandedShortcuts = useMemo(
      () => expandShortcutsForOS(shortcuts, os === "mac"),
      [shortcuts, os]
    );

    // Filter shortcuts by category and search query
    const filteredShortcuts = useMemo(() => {
      let result = expandedShortcuts;

      // Apply category filter
      if (categoryFilter !== "all") {
        result = result.filter((s) => s.category === categoryFilter);
      }

      // Apply search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        result = result.filter(
          (s) =>
            s.title.toLowerCase().includes(query) ||
            s.description?.toLowerCase().includes(query) ||
            s.slug.toLowerCase().includes(query) ||
            s.keyCombo.some((k) => k.toLowerCase().includes(query))
        );
      }

      return result;
    }, [expandedShortcuts, categoryFilter, searchQuery]);

    // Group shortcuts by category
    const groupedShortcuts = useMemo(() => {
      const groups: Record<string, Shortcut[]> = {};

      if (categoryFilter === "all") {
        // Group by category
        filteredShortcuts.forEach((shortcut) => {
          if (!groups[shortcut.category]) {
            groups[shortcut.category] = [];
          }
          groups[shortcut.category].push(shortcut);
        });
      } else {
        // Single category, still wrap in object for consistency
        groups[categoryFilter] = filteredShortcuts;
      }

      return groups;
    }, [filteredShortcuts, categoryFilter]);

    const handleOsToggle = useCallback(
      (_: React.MouseEvent<HTMLElement>, value: "mac" | "win" | null | null) => {
        if (value) {
          setOs(value);
        }
      },
      []
    );

    const _handleCategoryToggle = useCallback(
      (_: React.MouseEvent<HTMLElement>, value: any) => {
        if (value !== null) {
          setCategoryFilter(value);
        }
      },
      []
    );

    const handleSearchChange = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(event.target.value);
      },
      []
    );

    const handleClearSearch = useCallback(() => {
      setSearchQuery("");
      inputRef.current?.focus();
    }, []);

    if (!open) {
      return null;
    }

    const hasResults = filteredShortcuts.length > 0;
    const categories = Array.from(
      new Set(expandedShortcuts.map((s) => s.category))
    ) as Shortcut["category"][];

    return (
      <Box
        className="keyboard-shortcuts-dialog"
        css={styles(theme)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-shortcuts-title"
      >
        {/* Header */}
        <Box className="dialog-header">
          <Typography id="keyboard-shortcuts-title" className="dialog-title" variant="h2">
            Keyboard Shortcuts
          </Typography>
          <CloseButton
            onClick={onClose}
            tooltip="Close (Escape)"
            buttonSize="small"
          />
        </Box>

        {/* Controls */}
        <Box className="dialog-controls">
          <TextField
            ref={inputRef}
            className="search-field"
            placeholder="Search shortcuts..."
            value={searchQuery}
            onChange={handleSearchChange}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: searchQuery && (
                <InputAdornment position="end">
                  <CloseButton
                    onClick={handleClearSearch}
                    tooltip="Clear search"
                    buttonSize="small"
                    sx={{ marginRight: -0.5 }}
                  />
                </InputAdornment>
              )
            }}
            autoComplete="off"
          />
          <ToggleButtonGroup
            value={os}
            exclusive
            onChange={handleOsToggle}
            size="small"
          >
            <ToggleButton value="mac" className="os-toggle">
              macOS
            </ToggleButton>
            <ToggleButton value="win" className="os-toggle">
              Windows/Linux
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Category Filters */}
        <Box className="category-chips">
          <Chip
            label="All"
            className="category-chip"
            onClick={() => setCategoryFilter("all")}
            variant={categoryFilter === "all" ? "filled" : "outlined"}
            color={categoryFilter === "all" ? "primary" : "default"}
            size="small"
          />
          {categories.map((category) => (
            <Chip
              key={category}
              label={SHORTCUT_CATEGORIES[category]}
              className="category-chip"
              onClick={() => setCategoryFilter(category)}
              variant={categoryFilter === category ? "filled" : "outlined"}
              color={categoryFilter === category ? "primary" : "default"}
              size="small"
            />
          ))}
        </Box>

        {/* Shortcuts List */}
        {hasResults ? (
          <List className="shortcuts-list">
            {Object.entries(groupedShortcuts).map(
              ([category, categoryShortcuts]) =>
                categoryShortcuts.length > 0 && (
                  <Box key={category} className="category-section">
                    {categoryFilter === "all" && (
                      <Box className="category-header">
                        <Typography className="category-title">
                          {SHORTCUT_CATEGORIES[category as Shortcut["category"]]}
                          <span className="category-count">
                            ({categoryShortcuts.length})
                          </span>
                        </Typography>
                      </Box>
                    )}
                    {categoryShortcuts.map((shortcut, index) => (
                      <ListItem key={`${shortcut.slug}-${index}`} className="shortcut-item" disablePadding>
                        <Box className="shortcut-content">
                          <Box className="shortcut-info">
                            <Typography className="shortcut-title">
                              {highlightMatch(shortcut.title, searchQuery, theme)}
                            </Typography>
                            {shortcut.description && (
                              <Typography className="shortcut-description">
                                {highlightMatch(shortcut.description, searchQuery, theme)}
                              </Typography>
                            )}
                          </Box>
                          <Box className="shortcut-keys">
                            {shortcut.keyCombo.map((key, keyIndex) => (
                              <span key={keyIndex}>
                                {keyIndex > 0 && (
                                  <span className="key-separator">+</span>
                                )}
                                <span className="key-badge">
                                  {formatKey(key)}
                                </span>
                              </span>
                            ))}
                          </Box>
                        </Box>
                      </ListItem>
                    ))}
                  </Box>
                )
            )}
          </List>
        ) : (
          <Box className="empty-state">
            <SearchIcon className="empty-icon" />
            <Typography className="empty-text">
              {searchQuery
                ? `No shortcuts match "${searchQuery}"`
                : "No shortcuts available"}
            </Typography>
          </Box>
        )}
      </Box>
    );
  }
);

KeyboardShortcutsDialog.displayName = "KeyboardShortcutsDialog";

export default KeyboardShortcutsDialog;
