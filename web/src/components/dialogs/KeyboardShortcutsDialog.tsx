/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  Box,
  Typography,
  Tabs,
  Tab,
  TextField
} from "@mui/material";
import CloseButton from "../buttons/CloseButton";
import {
  NODE_EDITOR_SHORTCUTS,
  SHORTCUT_CATEGORIES,
  Shortcut
} from "../../config/shortcuts";
import { isMac } from "../../utils/platform";

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
  initialTab?: number;
}

const dialogStyles = (theme: Theme) =>
  css({
    "& .shortcuts-dialog": {
      height: "100%",
      display: "flex",
      flexDirection: "column"
    },
    "& .dialog-header": {
      display: "flex",
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "0 1em 0.5em 1em",
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    "& .dialog-title": {
      fontSize: "1.25rem",
      fontWeight: 600,
      color: theme.vars.palette.text.primary
    },
    "& .search-container": {
      padding: "0.75em 1em"
    },
    "& .shortcuts-content": {
      flex: 1,
      overflowY: "auto",
      padding: "0 1em 1em 1em",
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
    "& .category-section": {
      marginBottom: "1.5em"
    },
    "& .category-title": {
      fontSize: "0.875rem",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      color: theme.vars.palette.text.secondary,
      marginBottom: "0.75em",
      paddingBottom: "0.25em",
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    "& .shortcut-row": {
      display: "flex",
      alignItems: "center",
      padding: "0.5em 0",
      gap: "1em",
      "&:not(:last-child)": {
        borderBottom: `1px solid ${theme.vars.palette.divider}`
      }
    },
    "& .shortcut-title": {
      minWidth: "160px",
      fontSize: "0.9375rem",
      color: theme.vars.palette.text.primary
    },
    "& .shortcut-keys": {
      minWidth: "180px",
      display: "flex",
      alignItems: "center",
      gap: "0.25em"
    },
    "& .shortcut-description": {
      flex: 1,
      fontSize: "0.875rem",
      color: theme.vars.palette.text.secondary,
      fontWeight: 400
    },
    "& .kbd": {
      display: "inline-block",
      padding: "0.2em 0.5em",
      fontSize: "0.75em",
      fontFamily: "monospace",
      fontWeight: 600,
      lineHeight: 1,
      color: theme.vars.palette.text.primary,
      backgroundColor: theme.vars.palette.grey[900],
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      borderRadius: "4px",
      boxShadow: `0 1px 2px ${theme.vars.palette.grey[900]}80`
    },
    "& .no-results": {
      textAlign: "center",
      padding: "2em",
      color: theme.vars.palette.text.secondary
    }
  });

const humanizeKey = (key: string): string => {
  switch (key.toLowerCase()) {
    case "control":
      return "CTRL";
    case "meta":
      return isMac() ? "⌘" : "WIN";
    case "alt":
      return isMac() ? "OPT" : "ALT";
    case "shift":
      return "SHIFT";
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
      return "ENTER";
    case "backspace":
      return "BACKSPACE";
    case "tab":
      return "TAB";
    case "delete":
      return "DEL";
    case "pageup":
      return "PGUP";
    case "pagedown":
      return "PGDN";
    case "home":
      return "HOME";
    case "end":
      return "END";
    default:
      return key.length === 1 ? key.toUpperCase() : key;
  }
};

const renderKeyCombo = (combo: string[]): React.ReactNode => {
  return (
    <Box component="span" className="combo">
      {combo.map((key, index) => (
        <React.Fragment key={index}>
          {index > 0 && <span style={{ margin: "0 0.25em" }}>+</span>}
          <kbd className="kbd">{humanizeKey(key)}</kbd>
        </React.Fragment>
      ))}
    </Box>
  );
};

const KeyboardShortcutsDialog: React.FC<KeyboardShortcutsDialogProps> = ({
  open,
  onClose,
  initialTab = 0
}) => {
  const theme = useTheme();
  const [search, setSearch] = useState("");
  const [tabValue, setTabValue] = useState(initialTab);
  const styles = useMemo(() => dialogStyles(theme), [theme]);

  const lower = search.toLowerCase();

  const filteredShortcuts = useMemo(() => {
    if (!lower) {return NODE_EDITOR_SHORTCUTS;}
    return NODE_EDITOR_SHORTCUTS.filter(
      (s) =>
        s.title.toLowerCase().includes(lower) ||
        (s.description && s.description.toLowerCase().includes(lower)) ||
        s.keyCombo.some((k) => k.toLowerCase().includes(lower))
    );
  }, [lower]);

  const categories = useMemo<Array<keyof typeof SHORTCUT_CATEGORIES>>(
    () => Object.keys(SHORTCUT_CATEGORIES) as Array<keyof typeof SHORTCUT_CATEGORIES>,
    []
  );

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      sx={{
        "& .MuiDialog-paper": {
          width: "90vw",
          maxWidth: "800px",
          height: "80vh",
          maxHeight: "700px",
          margin: "auto",
          borderRadius: theme.vars.rounded.dialog,
          border: `1px solid ${theme.vars.palette.grey[700]}`,
          backgroundColor: theme.vars.palette.glass.backgroundDialogContent
        }
      }}
      slotProps={{
        backdrop: {
          style: {
            backdropFilter: theme.vars.palette.glass.blur,
            backgroundColor: theme.vars.palette.glass.backgroundDialog
          }
        }
      }}
    >
      <div css={styles} className="shortcuts-dialog">
        <div className="dialog-header">
          <Typography className="dialog-title">Keyboard Shortcuts</Typography>
          <CloseButton onClick={onClose} />
        </div>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          sx={{ px: 1, borderBottom: `1px solid ${theme.vars.palette.divider}` }}
        >
          <Tab label="All Shortcuts" />
          <Tab label="Editor" />
          <Tab label="Workflow" />
          <Tab label="Panels" />
        </Tabs>
        <Box className="search-container">
          <TextField
            variant="outlined"
            size="small"
            placeholder="Search shortcuts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            fullWidth
            autoFocus
          />
        </Box>
        <DialogContent sx={{ p: 0 }} className="shortcuts-content">
          {tabValue === 0 && (
            <AllShortcutsTab
              shortcuts={filteredShortcuts}
              categories={categories}
            />
          )}
          {tabValue === 1 && (
            <CategoryShortcutsTab
              shortcuts={filteredShortcuts}
              category="editor"
              categories={categories}
            />
          )}
          {tabValue === 2 && (
            <CategoryShortcutsTab
              shortcuts={filteredShortcuts}
              category="workflow"
              categories={categories}
            />
          )}
          {tabValue === 3 && (
            <CategoryShortcutsTab
              shortcuts={filteredShortcuts}
              category="panel"
              categories={categories}
            />
          )}
        </DialogContent>
      </div>
    </Dialog>
  );
};

interface ShortcutsTabProps {
  shortcuts: Shortcut[];
  categories: Array<keyof typeof SHORTCUT_CATEGORIES>;
}

const AllShortcutsTab: React.FC<ShortcutsTabProps> = ({
  shortcuts,
  categories
}) => {
  if (shortcuts.length === 0) {
    return (
      <Box className="no-results">
        <Typography variant="body1">No shortcuts found</Typography>
      </Box>
    );
  }

  return (
    <Box>
      {categories.map((cat) => {
        const list = shortcuts.filter((s) => s.category === cat);
        if (!list.length) {return null;}
        return (
          <Box key={cat} className="category-section">
            <Typography className="category-title">
              {SHORTCUT_CATEGORIES[cat]}
            </Typography>
            {list.map((s) => (
              <ShortcutRow key={s.slug} shortcut={s} />
            ))}
          </Box>
        );
      })}
    </Box>
  );
};

interface CategoryTabProps extends ShortcutsTabProps {
  category: "editor" | "panel" | "assets" | "workflow";
}

const CategoryShortcutsTab: React.FC<CategoryTabProps> = ({
  shortcuts,
  category,
  categories: _categories
}) => {
  const categoryList = shortcuts.filter((s) => s.category === category);

  if (categoryList.length === 0) {
    return (
      <Box className="no-results">
        <Typography variant="body1">
          No shortcuts found for this category
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box className="category-section">
        <Typography className="category-title">
          {SHORTCUT_CATEGORIES[category]}
        </Typography>
        {categoryList.map((s) => (
          <ShortcutRow key={s.slug} shortcut={s} />
        ))}
      </Box>
    </Box>
  );
};

interface ShortcutRowProps {
  shortcut: Shortcut;
}

const ShortcutRow: React.FC<ShortcutRowProps> = ({ shortcut }) => {
  const displayCombo = isMac()
    ? shortcut.keyComboMac ?? shortcut.keyCombo
    : shortcut.keyCombo;

  return (
    <Box className="shortcut-row">
      <Typography className="shortcut-title">{shortcut.title}</Typography>
      <Box className="shortcut-keys">
        {renderKeyCombo(displayCombo)}
      </Box>
      {shortcut.description && (
        <Typography className="shortcut-description">
          {shortcut.description}
        </Typography>
      )}
    </Box>
  );
};

export default KeyboardShortcutsDialog;
