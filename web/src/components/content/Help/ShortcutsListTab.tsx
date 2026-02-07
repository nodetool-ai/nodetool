/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import {
  Box,
  TextField,
  ToggleButtonGroup,
  ToggleButton,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  InputAdornment
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SearchIcon from "@mui/icons-material/Search";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type { Shortcut } from "../../../config/shortcuts";
import {
  SHORTCUT_CATEGORIES
} from "../../../config/shortcuts";
import { isMac } from "../../../utils/platform";
import { memo, useMemo, useState, useCallback } from "react";
import { Fragment as Fragment } from "react";

const styles = (theme: Theme) =>
  css({
    ".container": {
      height: "100%",
      display: "flex",
      flexDirection: "column",
      gap: "16px"
    },
    ".controls": {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      flexWrap: "wrap"
    },
    ".search-field": {
      flex: 1,
      minWidth: "200px",
      "& .MuiInputBase-root": {
        borderRadius: "8px"
      }
    },
    ".category-buttons": {
      display: "flex",
      gap: "4px",
      flexWrap: "wrap"
    },
    ".category-button": {
      textTransform: "none",
      fontSize: "13px",
      fontWeight: 500,
      borderRadius: "6px",
      padding: "6px 12px",
      border: `1px solid ${theme.vars.palette.divider}`,
      "&.Mui-selected": {
        backgroundColor: theme.vars.palette.primary.main,
        color: theme.vars.palette.primary.contrastText,
        borderColor: theme.vars.palette.primary.main
      }
    },
    ".shortcuts-container": {
      flex: 1,
      overflowY: "auto",
      "&::-webkit-scrollbar": {
        width: "8px"
      },
      "&::-webkit-scrollbar-track": {
        background: theme.vars.palette.grey[800],
        borderRadius: "4px"
      },
      "&::-webkit-scrollbar-thumb": {
        background: theme.vars.palette.grey[500],
        borderRadius: "4px",
        "&:hover": {
          background: theme.vars.palette.grey[400]
        }
      }
    },
    ".category-section": {
      marginBottom: "16px",
      "&:last-child": {
        marginBottom: 0
      }
    },
    ".category-accordion": {
      backgroundColor: theme.vars.palette.action.hover,
      borderRadius: "8px !important",
      "&::before": {
        display: "none"
      },
      "&.Mui-expanded": {
        margin: "0 auto 8px auto"
      }
    },
    ".category-summary": {
      minHeight: "48px",
      fontWeight: 600,
      fontSize: "15px",
      color: theme.vars.palette.text.primary,
      "& .Mui-expanded": {
        margin: "12px 0"
      }
    },
    ".category-details": {
      padding: "8px 16px 16px 16px",
      display: "flex",
      flexDirection: "column",
      gap: "8px"
    },
    ".shortcut-item": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 12px",
      borderRadius: "6px",
      backgroundColor: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.divider}`,
      transition: "all 0.15s ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.selected,
        borderColor: theme.vars.palette.primary.main
      }
    },
    ".shortcut-info": {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      gap: "2px"
    },
    ".shortcut-title": {
      fontSize: "14px",
      fontWeight: 500,
      color: theme.vars.palette.text.primary
    },
    ".shortcut-description": {
      fontSize: "12px",
      color: theme.vars.palette.text.secondary
    },
    ".shortcut-keys": {
      display: "flex",
      alignItems: "center",
      gap: "4px"
    },
    ".key-chip": {
      fontSize: "12px",
      fontWeight: 600,
      height: "24px",
      minWidth: "24px",
      padding: "0 8px",
      backgroundColor: theme.vars.palette.grey[700],
      color: theme.vars.palette.text.primary,
      border: `1px solid ${theme.vars.palette.grey[600]}`,
      fontFamily: "monospace"
    },
    ".key-separator": {
      color: theme.vars.palette.text.secondary,
      fontSize: "14px",
      margin: "0 2px"
    },
    ".empty-state": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "48px 24px",
      color: theme.vars.palette.text.secondary,
      textAlign: "center"
    },
    ".empty-icon": {
      fontSize: "48px",
      marginBottom: "16px",
      opacity: 0.5
    },
    ".empty-text": {
      fontSize: "14px"
    },
    ".match-count": {
      fontSize: "12px",
      color: theme.vars.palette.text.secondary,
      marginLeft: "auto",
      padding: "4px 8px",
      backgroundColor: theme.vars.palette.action.hover,
      borderRadius: "4px"
    }
  });

interface ShortcutsListTabProps {
  shortcuts: Shortcut[];
}

/**
 * Renders a searchable, categorized list view of keyboard shortcuts.
 * Features:
 * - Search by shortcut name, description, or keys
 * - Filter by category
 * - OS-specific key combinations (macOS vs Windows/Linux)
 * - Collapsible category sections
 * - Keyboard shortcuts highlighted as chips
 */
const ShortcutsListTab: React.FC<ShortcutsListTabProps> = memo(
  function ShortcutsListTab({ shortcuts }: ShortcutsListTabProps) {
    const theme = useTheme();
    const themeStyles = useMemo(() => styles(theme), [theme]);

    const [os, setOs] = useState<"mac" | "win">(isMac() ? "mac" : "win");
    const [categoryFilter, setCategoryFilter] = useState<
      "all" | Shortcut["category"]
    >("all");
    const [searchTerm, setSearchTerm] = useState("");
    const [expandedCategories, setExpandedCategories] = useState<
      Set<string>
    >(new Set(Object.values(SHORTCUT_CATEGORIES)));

    // Filter shortcuts by category and search term
    const filteredShortcuts = useMemo(() => {
      let result = shortcuts;

      // Filter by category
      if (categoryFilter !== "all") {
        result = result.filter((s) => s.category === categoryFilter);
      }

      // Filter by search term
      if (searchTerm.trim()) {
        const searchLower = searchTerm.toLowerCase().trim();
        result = result.filter((s) => {
          const titleMatch = s.title.toLowerCase().includes(searchLower);
          const descMatch =
            s.description?.toLowerCase().includes(searchLower) ?? false;
          const keysMatch = s.keyCombo.some((k) =>
            k.toLowerCase().includes(searchLower)
          );
          return titleMatch || descMatch || keysMatch;
        });
      }

      return result;
    }, [shortcuts, categoryFilter, searchTerm]);

    // Group filtered shortcuts by category
    const groupedShortcuts = useMemo(() => {
      const groups: Record<string, Shortcut[]> = {};
      filteredShortcuts.forEach((shortcut) => {
        const categoryName = SHORTCUT_CATEGORIES[shortcut.category];
        if (!groups[categoryName]) {
          groups[categoryName] = [];
        }
        groups[categoryName].push(shortcut);
      });
      return groups;
    }, [filteredShortcuts]);

    // Expand/collapse category
    const handleCategoryToggle = useCallback((category: string) => {
      setExpandedCategories((prev) => {
        const next = new Set(prev);
        if (next.has(category)) {
          next.delete(category);
        } else {
          next.add(category);
        }
        return next;
      });
    }, []);

    // Expand all categories
    const handleExpandAll = useCallback(() => {
      setExpandedCategories(new Set(Object.values(SHORTCUT_CATEGORIES)));
    }, []);

    // Collapse all categories
    const handleCollapseAll = useCallback(() => {
      setExpandedCategories(new Set());
    }, []);

    // Render key combination as chips
    const renderKeyCombo = useCallback(
      (shortcut: Shortcut) => {
        const combo = os === "mac" && shortcut.keyComboMac
          ? shortcut.keyComboMac
          : shortcut.keyCombo;

        const displayKey = (key: string): string => {
          const lowerKey = key.toLowerCase();
          switch (lowerKey) {
            case "control":
              return os === "mac" ? "⌘" : "Ctrl";
            case "meta":
              return "⌘";
            case "alt":
              return os === "mac" ? "⌥" : "Alt";
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
            case "pageup":
              return "PgUp";
            case "pagedown":
              return "PgDn";
            case "tab":
              return "Tab";
            default:
              return key.length === 1 ? key.toUpperCase() : key;
          }
        };

        return (
          <Box className="shortcut-keys">
            {combo.map((key, index) => (
              <Fragment key={index}>
                {index > 0 && (
                  <span className="key-separator">+</span>
                )}
                <Chip
                  label={displayKey(key)}
                  size="small"
                  className="key-chip"
                />
              </Fragment>
            ))}
          </Box>
        );
      },
      [os]
    );

    const hasResults = Object.keys(groupedShortcuts).length > 0;

    return (
      <Box css={themeStyles}>
        <div className="container">
          {/* Controls */}
          <div className="controls">
            <TextField
              className="search-field"
              placeholder="Search shortcuts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: searchTerm && (
                  <InputAdornment position="end">
                    <Typography className="match-count">
                      {filteredShortcuts.length}
                    </Typography>
                  </InputAdornment>
                )
              }}
              size="small"
            />
            <ToggleButtonGroup
              value={os}
              exclusive
              onChange={(_, value) => value && setOs(value)}
              size="small"
            >
              <ToggleButton value="mac">macOS</ToggleButton>
              <ToggleButton value="win">Windows/Linux</ToggleButton>
            </ToggleButtonGroup>
            <div className="category-buttons">
              <ToggleButton
                value="all"
                selected={categoryFilter === "all"}
                onClick={() => setCategoryFilter("all")}
                className="category-button"
              >
                All
              </ToggleButton>
              {(Object.entries(SHORTCUT_CATEGORIES) as [
                keyof typeof SHORTCUT_CATEGORIES,
                string
              ][]).map(([key, label]) => (
                <ToggleButton
                  key={key}
                  value={key}
                  selected={categoryFilter === key}
                  onClick={() => setCategoryFilter(key)}
                  className="category-button"
                >
                  {label}
                </ToggleButton>
              ))}
            </div>
            {hasResults && (
              <Box sx={{ marginLeft: "auto", display: "flex", gap: "4px" }}>
                <ToggleButton
                  value="expand"
                  onClick={handleExpandAll}
                  className="category-button"
                  title="Expand all categories"
                >
                  Expand All
                </ToggleButton>
                <ToggleButton
                  value="collapse"
                  onClick={handleCollapseAll}
                  className="category-button"
                  title="Collapse all categories"
                >
                  Collapse All
                </ToggleButton>
              </Box>
            )}
          </div>

          {/* Shortcuts List */}
          <div className="shortcuts-container">
            {hasResults ? (
              Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
                <div key={category} className="category-section">
                  <Accordion
                    className="category-accordion"
                    expanded={expandedCategories.has(category)}
                    onChange={() => handleCategoryToggle(category)}
                    elevation={0}
                  >
                    <AccordionSummary
                      expandIcon={<ExpandMoreIcon />}
                      className="category-summary"
                    >
                      <Typography variant="subtitle1">
                        {category} ({categoryShortcuts.length})
                      </Typography>
                    </AccordionSummary>
                    <AccordionDetails className="category-details">
                      {categoryShortcuts.map((shortcut) => (
                        <div key={shortcut.slug} className="shortcut-item">
                          <div className="shortcut-info">
                            <Typography className="shortcut-title">
                              {shortcut.title}
                            </Typography>
                            {shortcut.description && (
                              <Typography className="shortcut-description">
                                {shortcut.description}
                              </Typography>
                            )}
                          </div>
                          {renderKeyCombo(shortcut)}
                        </div>
                      ))}
                    </AccordionDetails>
                  </Accordion>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <SearchIcon className="empty-icon" />
                <Typography className="empty-text">
                  No shortcuts match &quot;{searchTerm}&quot;
                </Typography>
              </div>
            )}
          </div>
        </div>
      </Box>
    );
  }
);

ShortcutsListTab.displayName = "ShortcutsListTab";

export default ShortcutsListTab;
