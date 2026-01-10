/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import React, { useMemo, useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CloseButton from "../buttons/CloseButton";
import {
  Shortcut,
  expandShortcutsForOS,
  SHORTCUT_CATEGORIES,
  NODE_EDITOR_SHORTCUTS
} from "../../config/shortcuts";
import { isMac } from "../../utils/platform";

interface TabPanelProps {
  children: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`shortcuts-tabpanel-${index}`}
      aria-labelledby={`shortcuts-tab-${index}`}
    >
      {value === index && <Box sx={{ height: "100%", overflow: "auto" }}>{children}</Box>}
    </div>
  );
}

const styles = (theme: Theme) =>
  css({
    ".MuiDialog-paper": {
      width: "600px",
      maxWidth: "90vw",
      height: "70vh",
      maxHeight: "80vh",
      margin: "auto",
      borderRadius: theme.vars.rounded.dialog,
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      backgroundColor: theme.vars.palette.glass.backgroundDialogContent
    },
    ".dialog-header": {
      display: "flex",
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "0 16px 0 24px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      minHeight: "56px"
    },
    ".dialog-title": {
      padding: "16px 0",
      margin: 0,
      fontSize: theme.typography.h6.fontSize,
      fontWeight: 600
    },
    ".search-container": {
      padding: "12px 24px"
    },
    ".shortcut-list": {
      padding: "0 24px 16px",
      height: "calc(100% - 120px)",
      overflowY: "auto",
      "&::-webkit-scrollbar": {
        width: "8px"
      },
      "&::-webkit-scrollbar-track": {
        background: theme.vars.palette.grey[800]
      },
      "&::-webkit-scrollbar-thumb": {
        background: theme.vars.palette.grey[500],
        borderRadius: "4px"
      },
      "&::-webkit-scrollbar-thumb:hover": {
        background: theme.vars.palette.grey[400]
      }
    },
    ".category-section": {
      marginBottom: "16px"
    },
    ".category-title": {
      fontSize: theme.typography.caption.fontSize,
      fontWeight: 600,
      color: theme.vars.palette.text.secondary,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      marginBottom: "8px",
      paddingLeft: "4px"
    },
    ".shortcut-item": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 12px",
      borderRadius: "6px",
      marginBottom: "4px",
      transition: "background-color 0.15s ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    ".shortcut-title": {
      fontSize: theme.typography.body1.fontSize,
      color: theme.vars.palette.text.primary
    },
    ".shortcut-description": {
      fontSize: theme.typography.caption.fontSize,
      color: theme.vars.palette.text.secondary,
      marginLeft: "8px"
    },
    ".shortcut-keys": {
      display: "flex",
      alignItems: "center",
      gap: "4px"
    },
    ".key": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: "28px",
      height: "24px",
      padding: "0 6px",
      fontSize: theme.typography.caption.fontSize,
      fontWeight: 500,
      borderRadius: "4px",
      backgroundColor: theme.vars.palette.grey[700],
      color: theme.vars.palette.text.primary,
      border: `1px solid ${theme.vars.palette.grey[600]}`
    },
    ".key-separator": {
      color: theme.vars.palette.text.secondary,
      fontSize: theme.typography.caption.fontSize,
      margin: "0 2px"
    },
    ".no-results": {
      textAlign: "center",
      padding: "32px",
      color: theme.vars.palette.text.secondary
    }
  });

const humanizeKey = (key: string): string => {
  switch (key.toLowerCase()) {
    case "control":
      return isMac() ? "⌃" : "CTRL";
    case "meta":
      return isMac() ? "⌘" : "CTRL";
    case "alt":
      return isMac() ? "⌥" : "ALT";
    case "option":
      return isMac() ? "⌥" : "ALT";
    case "shift":
      return "⇧";
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
    case " ":
    case "space":
      return "SPACE";
    case "backspace":
      return "⌫";
    case "enter":
      return "↵";
    case "pagedown":
      return "PGDN";
    case "pageup":
      return "PGUP";
    case "mouseRight":
      return isMac() ? "Right Click" : "Right Click";
    default:
      return key.length === 1 ? key.toUpperCase() : key;
  }
};

const renderKeyCombo = (combo: string[]): React.ReactNode[] => {
  return combo.flatMap((key, idx) => {
    const nodes: React.ReactNode[] = [
      <kbd key={`k-${idx}`} className="key">
        {humanizeKey(key)}
      </kbd>
    ];
    if (idx < combo.length - 1) {
      nodes.push(
        <span key={`s-${idx}`} className="key-separator">
          +
        </span>
      );
    }
    return nodes;
  });
};

interface ShortcutListProps {
  shortcuts: Shortcut[];
  searchQuery: string;
  category: "all" | "editor" | "panel" | "assets" | "workflow";
}

const ShortcutList: React.FC<ShortcutListProps> = ({
  shortcuts,
  searchQuery,
  category
}) => {
  const filtered = useMemo(() => {
    let result = shortcuts;

    if (category !== "all") {
      result = result.filter((s) => s.category === category);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.title.toLowerCase().includes(query) ||
          s.description?.toLowerCase().includes(query) ||
          s.keyCombo.some((k) => k.toLowerCase().includes(query))
      );
    }

    return result;
  }, [shortcuts, searchQuery, category]);

  const grouped = useMemo(() => {
    const groups: Record<string, Shortcut[]> = {};
    filtered.forEach((shortcut) => {
      const cat = shortcut.category;
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(shortcut);
    });
    return groups;
  }, [filtered]);

  const sortedCategories = useMemo(
    () =>
      Object.keys(grouped).sort((a, b) => {
        const order: Record<string, number> = {
          editor: 0,
          workflow: 1,
          panel: 2,
          assets: 3
        };
        return (order[a] ?? 99) - (order[b] ?? 99);
      }),
    [grouped]
  );

  if (filtered.length === 0) {
    return (
      <div className="no-results">
        <Typography variant="body1">No shortcuts found</Typography>
        <Typography variant="body2" color="text.secondary">
          Try a different search term
        </Typography>
      </div>
    );
  }

  return (
    <div className="shortcut-list">
      {sortedCategories.map((cat) => (
          <div key={cat} className="category-section">
            <Typography variant="caption" className="category-title">
              {SHORTCUT_CATEGORIES[cat as keyof typeof SHORTCUT_CATEGORIES] || cat}
            </Typography>
            {grouped[cat].map((shortcut) => (
              <div key={shortcut.slug} className="shortcut-item">
                <div>
                  <Typography variant="body1" component="span" className="shortcut-title">
                    {shortcut.title}
                  </Typography>
                  {shortcut.description && (
                    <Typography
                      variant="caption"
                      component="span"
                      className="shortcut-description"
                    >
                      {shortcut.description}
                    </Typography>
                  )}
              </div>
              <div className="shortcut-keys">
                {renderKeyCombo(shortcut.keyCombo)}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

const KeyboardShortcutsDialog: React.FC<KeyboardShortcutsDialogProps> = ({
  open,
  onClose
}) => {
  const theme = useTheme();
  const dialogStyles = useMemo(() => styles(theme), [theme]);
  const [tabValue, setTabValue] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState<
    "all" | "editor" | "panel" | "assets" | "workflow"
  >("all");

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleCategoryChange = (
    _: React.SyntheticEvent,
    newCategory: "all" | "editor" | "panel" | "assets" | "workflow"
  ) => {
    if (newCategory !== null) {
      setCategory(newCategory);
    }
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  };

  const shortcuts = useMemo(
    () => expandShortcutsForOS(NODE_EDITOR_SHORTCUTS, isMac()),
    []
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="keyboard-shortcuts-dialog-title"
    >
      <div css={dialogStyles}>
        <div className="dialog-header">
          <Typography variant="h6" className="dialog-title" id="keyboard-shortcuts-dialog-title">
            Keyboard Shortcuts
          </Typography>
          <CloseButton onClick={onClose} />
        </div>

        <div className="search-container">
          <TextField
            fullWidth
            size="small"
            placeholder="Search shortcuts..."
            value={searchQuery}
            onChange={handleSearchChange}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                </InputAdornment>
              )
            }}
          />
        </div>

        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          variant="fullWidth"
          sx={{ px: 3, borderBottom: 1, borderColor: "divider" }}
        >
          <Tab label="List View" id="shortcuts-tab-0" aria-controls="shortcuts-tabpanel-0" />
          <Tab label="By Category" id="shortcuts-tab-1" aria-controls="shortcuts-tabpanel-1" />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          <Tabs
            value={category}
            onChange={handleCategoryChange}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ px: 3, mt: 1 }}
          >
            <Tab label="All" value="all" />
            <Tab label="Editor" value="editor" />
            <Tab label="Workflow" value="workflow" />
            <Tab label="Panels" value="panel" />
            <Tab label="Assets" value="assets" />
          </Tabs>
          <ShortcutList shortcuts={shortcuts} searchQuery={searchQuery} category={category} />
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <DialogContent sx={{ p: 3 }}>
            <Typography variant="body2" color="text.secondary" paragraph>
              Press <kbd className="key">?</kbd> or <kbd className="key">/</kbd> in the editor to open the command menu.
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Press <kbd className="key">Space</kbd> to open the node menu when the canvas is focused.
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Press <kbd className="key">Ctrl</kbd>+<kbd className="key">Enter</kbd> to run your workflow.
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Press <kbd className="key">Ctrl</kbd>+<kbd className="key">K</kbd> to open the command palette.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              For a visual interactive keyboard, click the Help button in the app header.
            </Typography>
          </DialogContent>
        </TabPanel>
      </div>
    </Dialog>
  );
};

export default KeyboardShortcutsDialog;
