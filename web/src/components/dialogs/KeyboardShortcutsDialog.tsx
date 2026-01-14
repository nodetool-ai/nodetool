import React, { Fragment, useCallback, useMemo, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Tab,
  Tabs,
  Typography,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Tooltip,
  useTheme
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import {
  NODE_EDITOR_SHORTCUTS,
  SHORTCUT_CATEGORIES,
  Shortcut,
  expandShortcutsForOS
} from "../../config/shortcuts";
import { useIsDarkMode } from "../../hooks/useIsDarkMode";

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: string;
  value: string;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`shortcuts-tabpanel-${index}`}
      aria-labelledby={`shortcuts-tab-${index}`}
      style={{ maxHeight: "60vh", overflowY: "auto" }}
    >
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
};

const humanizeKey = (key: string): string => {
  switch (key.toLowerCase()) {
    case "control":
      return "Ctrl";
    case "meta":
      return "⌘";
    case "alt":
      return "Alt";
    case "option":
      return "Opt";
    case "shift":
      return "Shift";
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
      return "Enter";
    case "backspace":
      return "Backspace";
    case "delete":
      return "Del";
    case "tab":
      return "Tab";
    case "pageup":
      return "PageUp";
    case "pagedown":
      return "PageDown";
    default:
      return key.length === 1 ? key.toUpperCase() : key;
  }
};

const renderKeyCombo = (combo: string[]): React.ReactNode => {
  return (
    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
      {combo.map((key, index) => (
        <Fragment key={index}>
          {index > 0 && <Typography sx={{ color: "text.secondary" }}>+</Typography>}
          <Chip
            label={humanizeKey(key)}
            size="small"
            sx={{
              minWidth: 28,
              height: 24,
              fontSize: "0.7rem",
              fontWeight: 600,
              bgcolor: "mode.hover",
              border: 1,
              borderColor: "divider"
            }}
          />
        </Fragment>
      ))}
    </Box>
  );
};

const ShortcutList: React.FC<{ shortcuts: Shortcut[] }> = ({ shortcuts }) => {
  const isDarkMode = useIsDarkMode();

    const sortedShortcuts = useMemo(
    () =>
      [...shortcuts].sort((a, b) => {
        const titleA = a.title.toLowerCase();
        const titleB = b.title.toLowerCase();
        if (titleA < titleB) {
          return -1;
        }
        if (titleA > titleB) {
          return 1;
        }
        return 0;
      }),
    [shortcuts]
  );

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  }, []);

  if (shortcuts.length === 0) {
    return (
      <Typography sx={{ color: "text.secondary", textAlign: "center", py: 4 }}>
        No shortcuts in this category
      </Typography>
    );
  }

  return (
    <List dense>
      {sortedShortcuts.map((shortcut, index) => {
        const winCombo = expandShortcutsForOS([shortcut], false)[0].keyCombo;
        const macCombo = expandShortcutsForOS([shortcut], true)[0].keyCombo;
        const showBoth = winCombo.join(" + ") !== macCombo.join(" + ");

        return (
          <ListItem
            key={`${shortcut.slug}-${index}`}
            sx={{
              borderRadius: 1,
              mb: 0.5,
              bgcolor: isDarkMode ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
              "&:hover": {
                bgcolor: isDarkMode
                  ? "rgba(255,255,255,0.05)"
                  : "rgba(0,0,0,0.04)"
              }
            }}
          >
            <ListItemText
              primary={
                <Typography variant="body2" fontWeight={500}>
                  {shortcut.title}
                </Typography>
              }
              secondary={
                shortcut.description ? (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mt: 0.5 }}
                  >
                    {shortcut.description}
                  </Typography>
                ) : null
              }
            />
            <ListItemSecondaryAction>
              <Tooltip title="Copy shortcut">
                <IconButton
                  edge="end"
                  size="small"
                  onClick={() =>
                    copyToClipboard(
                      `${shortcut.title}: ${winCombo.join(" + ")}`
                    )
                  }
                  sx={{ opacity: 0.7, "&:hover": { opacity: 1 } }}
                >
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Box sx={{ display: "inline-flex", ml: 1 }}>
                {showBoth ? (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    {renderKeyCombo(winCombo)}
                    <Typography sx={{ color: "text.secondary", mx: 0.5 }}>
                      /
                    </Typography>
                    {renderKeyCombo(macCombo)}
                  </Box>
                ) : (
                  renderKeyCombo(winCombo)
                )}
              </Box>
            </ListItemSecondaryAction>
          </ListItem>
        );
      })}
    </List>
  );
};

const KeyboardShortcutsDialog: React.FC<KeyboardShortcutsDialogProps> = ({
  open,
  onClose
}) => {
  const theme = useTheme();
  const isDarkMode = useIsDarkMode();
  const [currentTab, setCurrentTab] = useState<string>("editor");

  const handleTabChange = useCallback(
    (_: React.SyntheticEvent, newValue: string) => {
      setCurrentTab(newValue);
    },
    []
  );

  const categories = useMemo(
    () =>
      Object.entries(SHORTCUT_CATEGORIES).filter(([key]) => {
        const categoryShortcuts = NODE_EDITOR_SHORTCUTS.filter(
          (s) => s.category === key
        );
        return categoryShortcuts.length > 0;
      }),
    []
  );

  const getShortcutsForCategory = useCallback((category: string) => {
    return NODE_EDITOR_SHORTCUTS.filter((s) => s.category === category);
  }, []);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      aria-labelledby="keyboard-shortcuts-dialog-title"
      slotProps={{
        paper: {
          sx: {
            borderRadius: 2,
            maxHeight: "80vh"
          }
        }
      }}
    >
      <DialogTitle
        id="keyboard-shortcuts-dialog-title"
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: 1,
          borderColor: "divider",
          pr: 1
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="h6" fontWeight={600}>
            Keyboard Shortcuts
          </Typography>
          <Chip
            label={`${NODE_EDITOR_SHORTCUTS.length} shortcuts`}
            size="small"
            sx={{
              height: 20,
              fontSize: "0.7rem",
              bgcolor: "primary.main",
              color: "primary.contrastText"
            }}
          />
        </Box>
        <IconButton onClick={onClose} size="small" aria-label="Close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0, display: "flex" }}>
        <Box
          sx={{
            width: 160,
            borderRight: 1,
            borderColor: "divider",
            bgcolor: isDarkMode
              ? "rgba(255,255,255,0.02)"
              : "rgba(0,0,0,0.02)"
          }}
        >
          <Tabs
            orientation="vertical"
            value={currentTab}
            onChange={handleTabChange}
            aria-label="Shortcut categories"
            sx={{
              "& .MuiTab-root": {
                alignItems: "flex-start",
                textAlign: "left",
                px: 2,
                py: 1.5,
                minHeight: 44,
                textTransform: "none",
                fontWeight: 500
              }
            }}
          >
            {categories.map(([key, label]) => {
              const count = getShortcutsForCategory(key).length;
              return (
                <Tab
                  key={key}
                  value={key}
                  label={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography variant="body2">{label}</Typography>
                      <Chip
                        label={count}
                        size="small"
                        sx={{
                          height: 18,
                          minWidth: 18,
                          fontSize: "0.65rem",
                          bgcolor:
                            currentTab === key
                              ? "primary.main"
                              : "transparent",
                          color:
                            currentTab === key
                              ? "primary.contrastText"
                              : "text.secondary"
                        }}
                      />
                    </Box>
                  }
                />
              );
            })}
          </Tabs>
        </Box>

        <Box sx={{ flex: 1, px: 3 }}>
          {categories.map(([key, label]) => (
            <TabPanel key={key} value={currentTab} index={key}>
              <Typography
                variant="subtitle2"
                color="text.secondary"
                sx={{ mb: 2, px: 1 }}
              >
                {label} shortcuts
              </Typography>
              <ShortcutList shortcuts={getShortcutsForCategory(key)} />
            </TabPanel>
          ))}
        </Box>
      </DialogContent>

      <DialogActions
        sx={{
          borderTop: 1,
          borderColor: "divider",
          px: 3,
          py: 1.5
        }}
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ mr: "auto" }}
        >
          Press{" "}
          <Chip
            label="?"
            size="small"
            sx={{ height: 18, fontSize: "0.65rem", mx: 0.5 }}
          />{" "}
          or{" "}
          <Chip
            label="/"
            size="small"
            sx={{ height: 18, fontSize: "0.65rem", mx: 0.5 }}
          />{" "}
          in the editor to open Command Menu
        </Typography>
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default KeyboardShortcutsDialog;
