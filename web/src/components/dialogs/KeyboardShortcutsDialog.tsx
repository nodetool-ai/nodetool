/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { memo, useState, useMemo, useCallback, useEffect, Fragment } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import {
  NODE_EDITOR_SHORTCUTS,
  SHORTCUT_CATEGORIES,
  Shortcut
} from "../../config/shortcuts";
import { useKeyboardShortcutsDialogStore } from "../../stores/KeyboardShortcutsDialogStore";

const dialogStyles = (theme: Theme) =>
  css({
    "&": {
      position: "fixed"
    },
    "& .MuiPaper-root": {
      width: "90vw",
      maxWidth: "900px",
      maxHeight: "80vh",
      backgroundColor: theme.vars.palette.background.paper,
      borderRadius: theme.vars.rounded?.dialog ?? "12px",
      border: `1px solid ${theme.vars.palette.divider}`
    },
    "& .dialog-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "16px 24px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    "& .dialog-title": {
      fontSize: theme.fontSizeBig,
      fontWeight: 600,
      color: theme.vars.palette.text.primary,
      margin: 0,
      padding: 0
    },
    "& .dialog-content": {
      padding: 0,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    },
    "& .search-container": {
      padding: "16px 24px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.action.hover
    },
    "& .search-input": {
      "& .MuiOutlinedInput-root": {
        backgroundColor: theme.vars.palette.background.paper,
        "&:hover .MuiOutlinedInput-notchedOutline": {
          borderColor: theme.vars.palette.divider
        }
      }
    },
    "& .tabs-container": {
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      minHeight: "48px"
    },
    "& .shortcuts-container": {
      flex: 1,
      overflow: "auto",
      padding: "16px 24px"
    },
    "& .category-section": {
      marginBottom: "24px"
    },
    "& .category-title": {
      fontSize: theme.fontSizeSmall,
      fontWeight: 600,
      color: theme.vars.palette.primary.main,
      textTransform: "uppercase",
      letterSpacing: "1px",
      marginBottom: "12px",
      paddingBottom: "8px",
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    "& .shortcut-row": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 12px",
      marginBottom: "4px",
      borderRadius: "6px",
      transition: "background-color 0.2s ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    "& .shortcut-title": {
      fontSize: theme.fontSizeNormal,
      color: theme.vars.palette.text.primary,
      flex: 1
    },
    "& .shortcut-description": {
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.text.secondary,
      marginLeft: "16px",
      flex: 1,
      display: "none",
      "@media (min-width: 600px)": {
        display: "block"
      }
    },
    "& .shortcut-keys": {
      display: "flex",
      alignItems: "center",
      gap: "4px",
      marginLeft: "16px"
    },
    "& .key": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: "32px",
      height: "28px",
      padding: "0 8px",
      fontSize: "0.75rem",
      fontWeight: 600,
      fontFamily: theme.fontFamily2,
      color: theme.vars.palette.text.primary,
      backgroundColor: theme.vars.palette.grey[800],
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: "4px",
      boxShadow: `0 1px 2px ${theme.vars.palette.grey[900]}`
    },
    "& .key-plus": {
      color: theme.vars.palette.text.secondary,
      fontSize: "0.75rem",
      padding: "0 4px"
    },
    "& .no-results": {
      textAlign: "center",
      padding: "48px 24px",
      color: theme.vars.palette.text.secondary
    },
    "& .os-toggle": {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      marginLeft: "16px"
    },
    "& .os-label": {
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.text.secondary
    }
  });

const humanizeKey = (key: string): string => {
  switch (key.toLowerCase()) {
    case "control":
      return "CTRL";
    case "meta":
      return "⌘";
    case "alt":
      return "ALT";
    case "option":
      return "OPT";
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
      return "BACK";
    case "delete":
      return "DEL";
    case "tab":
      return "TAB";
    case "pageup":
      return "PGUP";
    case "pagedown":
      return "PGDN";
    default:
      return key.length === 1 ? key.toUpperCase() : key;
  }
};

const renderKeyCombo = (combo: string[], _isMac: boolean): React.ReactNode => {
  return combo.map((key, index) => (
    <Fragment key={index}>
      <span className="key">{humanizeKey(key)}</span>
      {index < combo.length - 1 && <span className="key-plus">+</span>}
    </Fragment>
  ));
};

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel = ({ children, value, index }: TabPanelProps) => (
  <div
    role="tabpanel"
    hidden={value !== index}
    id={`shortcuts-tabpanel-${index}`}
    aria-labelledby={`shortcuts-tab-${index}`}
  >
    {value === index && <Box>{children}</Box>}
  </div>
);

const KeyboardShortcutsDialog = memo(
  function KeyboardShortcutsDialog() {
    const theme = useTheme();
    const memoizedStyles = useMemo(() => dialogStyles(theme), [theme]);
    const isOpen = useKeyboardShortcutsDialogStore((state) => state.isOpen);
    const close = useKeyboardShortcutsDialogStore((state) => state.close);

    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState(0);
    const [isMac, setIsMac] = useState(
      typeof navigator !== "undefined" && navigator.userAgent.includes("Mac")
    );

    const handleKeyDown = useCallback(
      (event: KeyboardEvent) => {
        if (event.key === "Escape" && isOpen) {
          event.preventDefault();
          close();
        }
      },
      [isOpen, close]
    );

    useEffect(() => {
      if (isOpen) {
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
      }
    }, [isOpen, handleKeyDown]);

    const filteredShortcuts = useMemo(() => {
      const term = searchTerm.toLowerCase().trim();
      return NODE_EDITOR_SHORTCUTS.filter((shortcut) => {
        if (term === "") {return true;}
        const titleMatch = shortcut.title.toLowerCase().includes(term);
        const descMatch = shortcut.description?.toLowerCase().includes(term) ?? false;
        const keyMatch = shortcut.keyCombo.some((k) =>
          k.toLowerCase().includes(term)
        );
        return titleMatch || descMatch || keyMatch;
      });
    }, [searchTerm]);

    const shortcutsByCategory = useMemo(() => {
      const result: Record<string, Shortcut[]> = {};
      filteredShortcuts.forEach((shortcut) => {
        if (!result[shortcut.category]) {
          result[shortcut.category] = [];
        }
        result[shortcut.category].push(shortcut);
      });
      return result;
    }, [filteredShortcuts]);

    const categories = useMemo(
      () => Object.keys(SHORTCUT_CATEGORIES),
      []
    );

    const getOsCombo = useCallback(
      (shortcut: Shortcut) => {
        if (isMac && shortcut.keyComboMac) {
          return shortcut.keyComboMac;
        }
        if (isMac) {
          return shortcut.keyCombo.map((key) => {
            if (key === "Control") {return "Meta";}
            if (key === "Alt") {return "Option";}
            return key;
          });
        }
        return shortcut.keyCombo;
      },
      [isMac]
    );

    const handleSearchChange = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(event.target.value);
      },
      []
    );

    const handleTabChange = useCallback(
      (_: React.SyntheticEvent, newValue: number) => {
        setActiveTab(newValue);
      },
      []
    );

    const handleClose = useCallback(() => {
      setSearchTerm("");
      close();
    }, [close]);

    return (
      <Dialog
        open={isOpen}
        onClose={handleClose}
        aria-labelledby="keyboard-shortcuts-dialog-title"
        css={memoizedStyles}
        sx={{
          "& .MuiDialog-paper": {
            width: "90vw",
            maxWidth: "900px",
            maxHeight: "80vh"
          }
        }}
        slotProps={{
          backdrop: {
            style: {
              backdropFilter: "blur(4px)",
              backgroundColor: "rgba(0, 0, 0, 0.5)"
            }
          }
        }}
      >
        <div className="dialog-header">
          <DialogTitle id="keyboard-shortcuts-dialog-title" className="dialog-title">
            Keyboard Shortcuts
          </DialogTitle>
          <div className="os-toggle">
            <span
              className="os-label"
              style={{ opacity: !isMac ? 1 : 0.5 }}
            >
              Windows/Linux
            </span>
            <IconButton
              size="small"
              onClick={() => setIsMac(!isMac)}
              sx={{
                padding: "4px",
                "&:hover": { backgroundColor: "action.hover" }
              }}
              aria-label="Toggle OS"
            >
              <Box
                sx={{
                  width: "40px",
                  height: "20px",
                  borderRadius: "10px",
                  backgroundColor: isMac
                    ? "primary.main"
                    : "action.disabledBackground",
                  position: "relative",
                  transition: "background-color 0.2s ease",
                  "&::after": {
                    content: '""',
                    position: "absolute",
                    top: "2px",
                    left: isMac ? "22px" : "2px",
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    backgroundColor: "background.paper",
                    transition: "left 0.2s ease",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.3)"
                  }
                }}
              />
            </IconButton>
            <span
              className="os-label"
              style={{ opacity: isMac ? 1 : 0.5 }}
            >
              macOS
            </span>
          </div>
          <IconButton
            onClick={handleClose}
            aria-label="Close"
            size="small"
            sx={{ marginLeft: "16px" }}
          >
            <CloseIcon />
          </IconButton>
        </div>

        <DialogContent className="dialog-content">
          <div className="search-container">
            <TextField
              className="search-input"
              fullWidth
              placeholder="Search shortcuts..."
              value={searchTerm}
              onChange={handleSearchChange}
              variant="outlined"
              size="small"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon
                      sx={{
                        color: theme.vars.palette.text.secondary
                      }}
                    />
                  </InputAdornment>
                )
              }}
            />
          </div>

          <div className="tabs-container">
            <Tabs
              value={activeTab}
              onChange={handleTabChange}
              aria-label="shortcut categories"
              variant="scrollable"
              scrollButtons="auto"
              sx={{
                minHeight: "48px",
                "& .MuiTab-root": {
                  minHeight: "48px",
                  minWidth: "auto",
                  padding: "12px 16px",
                  textTransform: "none",
                  fontSize: theme.fontSizeSmall,
                  fontWeight: 500
                }
              }}
            >
              <Tab label="All" />
              {categories.map((cat) => (
                <Tab key={cat} label={SHORTCUT_CATEGORIES[cat as keyof typeof SHORTCUT_CATEGORIES]} />
              ))}
            </Tabs>
          </div>

          <Box className="shortcuts-container">
            {searchTerm && filteredShortcuts.length === 0 ? (
              <div className="no-results">
                <Typography variant="body1" gutterBottom>
                  No shortcuts found
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Try a different search term
                </Typography>
              </div>
            ) : (
              <>
                <TabPanel value={activeTab} index={0}>
                  {categories.map((cat) => {
                    const shortcuts = shortcutsByCategory[cat as keyof typeof SHORTCUT_CATEGORIES];
                    if (!shortcuts || shortcuts.length === 0) {return null;}
                    return (
                      <div key={cat} className="category-section">
                        <Typography className="category-title">
                          {SHORTCUT_CATEGORIES[cat as keyof typeof SHORTCUT_CATEGORIES]}
                        </Typography>
                        {shortcuts.map((shortcut) => (
                          <div key={shortcut.slug} className="shortcut-row">
                            <Typography className="shortcut-title">
                              {shortcut.title}
                            </Typography>
                            {shortcut.description && (
                              <Typography className="shortcut-description">
                                {shortcut.description}
                              </Typography>
                            )}
                            <div className="shortcut-keys">
                              {renderKeyCombo(getOsCombo(shortcut), isMac)}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </TabPanel>
                {categories.map((cat, index) => {
                  const shortcuts = shortcutsByCategory[cat as keyof typeof SHORTCUT_CATEGORIES];
                  if (!shortcuts || shortcuts.length === 0) {return null;}
                  return (
                    <TabPanel key={cat} value={activeTab} index={index + 1}>
                      <div className="category-section">
                        {shortcuts.map((shortcut) => (
                          <div key={shortcut.slug} className="shortcut-row">
                            <Typography className="shortcut-title">
                              {shortcut.title}
                            </Typography>
                            {shortcut.description && (
                              <Typography className="shortcut-description">
                                {shortcut.description}
                              </Typography>
                            )}
                            <div className="shortcut-keys">
                              {renderKeyCombo(getOsCombo(shortcut), isMac)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </TabPanel>
                  );
                })}
              </>
            )}
          </Box>
        </DialogContent>
      </Dialog>
    );
  }
);

export default KeyboardShortcutsDialog;
