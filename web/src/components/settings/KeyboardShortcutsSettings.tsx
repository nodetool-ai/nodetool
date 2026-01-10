/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useState, useMemo, useCallback } from "react";
import {
  Box,
  TextField,
  Button,
  Typography,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ResetTvIcon from "@mui/icons-material/ResetTv";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import {
  NODE_EDITOR_SHORTCUTS,
  SHORTCUT_CATEGORIES,
  Shortcut
} from "../../config/shortcuts";
import { useShortcutSettingsStore } from "../../stores/ShortcutSettingsStore";
import ShortcutRow from "./ShortcutRow";
import ShortcutConflictDialog from "./ShortcutConflictDialog";
import { useNotificationStore } from "../../stores/NotificationStore";

const styles = (theme: Theme) =>
  css({
    "&": {
      padding: "0 1em"
    },
    ".header": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "1em",
      flexWrap: "wrap",
      gap: "1em"
    },
    ".search-bar": {
      display: "flex",
      alignItems: "center",
      gap: "0.5em",
      flex: 1,
      maxWidth: "400px",
      "& .MuiOutlinedInput-root": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    ".actions": {
      display: "flex",
      gap: "0.5em",
      flexWrap: "wrap"
    },
    ".filter-bar": {
      display: "flex",
      gap: "0.5em",
      marginBottom: "1em",
      flexWrap: "wrap"
    },
    ".category-section": {
      marginBottom: "1.5em"
    },
    ".category-header": {
      display: "flex",
      alignItems: "center",
      gap: "0.5em",
      marginBottom: "0.75em",
      paddingBottom: "0.5em",
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    ".category-count": {
      fontSize: "0.75em",
      color: theme.vars.palette.text.secondary,
      backgroundColor: theme.vars.palette.action.selected,
      padding: "0.2em 0.5em",
      borderRadius: "4px"
    },
    ".shortcuts-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))",
      gap: "0.75em"
    },
    ".export-import": {
      display: "flex",
      gap: "0.5em",
      padding: "1em",
      backgroundColor: theme.vars.palette.action.hover,
      borderRadius: "8px",
      marginTop: "1em"
    }
  });

const KeyboardShortcutsSettings: React.FC = () => {
  const theme = useTheme();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const {
    customShortcuts,
    setCustomShortcut,
    removeCustomShortcut,
    resetAllShortcuts,
    isConflicting,
    getConflicts
  } = useShortcutSettingsStore();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [editingShortcut, setEditingShortcut] = useState<Shortcut | null>(null);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [pendingShortcut, setPendingShortcut] = useState<{
    slug: string;
    combo: string[];
    macCombo?: string[];
  } | null>(null);
  const [conflicts, setConflicts] = useState<Array<{ slug: string; title: string }>>([]);

  const isMac = typeof navigator !== "undefined" &&
    navigator.userAgent.includes("Mac");

  const handleEditStart = useCallback((shortcut: Shortcut) => {
    setEditingShortcut(shortcut);
  }, []);

  const handleEditCancel = useCallback(() => {
    setEditingShortcut(null);
  }, []);

  const handleEditComplete = useCallback(
    (combo: string[], macCombo?: string[]) => {
      if (!editingShortcut) return;

      const newConflicts = getConflicts(editingShortcut.slug, combo, editingShortcut.slug);

      if (newConflicts.length > 0) {
        setConflicts(newConflicts);
        setPendingShortcut({
          slug: editingShortcut.slug,
          combo,
          macCombo
        });
        setConflictDialogOpen(true);
        return;
      }

      setCustomShortcut(editingShortcut.slug, combo, macCombo);
      setEditingShortcut(null);

      addNotification({
        type: "success",
        content: `Shortcut for "${editingShortcut.title}" updated`,
        dismissable: true
      });
    },
    [editingShortcut, setCustomShortcut, getConflicts, addNotification]
  );

  const handleConflictResolve = useCallback(
    (overwrite: boolean) => {
      if (!pendingShortcut) return;

      if (overwrite) {
        for (const conflict of conflicts) {
          removeCustomShortcut(conflict.slug);
        }
        setCustomShortcut(pendingShortcut.slug, pendingShortcut.combo, pendingShortcut.macCombo);
      }

      setConflictDialogOpen(false);
      setPendingShortcut(null);
      setConflicts([]);
      setEditingShortcut(null);

      addNotification({
        type: "success",
        content: overwrite
          ? "Shortcut updated (conflicting shortcuts removed)"
          : "Shortcut not updated",
        dismissable: true
      });
    },
    [pendingShortcut, conflicts, setCustomShortcut, removeCustomShortcut, addNotification]
  );

  const handleReset = useCallback(
    (slug: string, title: string) => {
      removeCustomShortcut(slug);
      addNotification({
        type: "info",
        content: `Shortcut for "${title}" reset to default`,
        dismissable: true
      });
    },
    [removeCustomShortcut, addNotification]
  );

  const handleResetAll = useCallback(() => {
    resetAllShortcuts();
    addNotification({
      type: "info",
      content: "All shortcuts reset to defaults",
      dismissable: true
    });
  }, [resetAllShortcuts, addNotification]);

  const handleExport = useCallback(() => {
    const exportData = JSON.stringify(customShortcuts, null, 2);
    const blob = new Blob([exportData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "nodetool-shortcuts.json";
    a.click();
    URL.revokeObjectURL(url);

    addNotification({
      type: "success",
      content: "Shortcuts exported successfully",
      dismissable: true
    });
  }, [customShortcuts, addNotification]);

  const handleImport = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const imported = JSON.parse(event.target?.result as string);
            if (typeof imported === "object" && imported !== null) {
              for (const [slug, data] of Object.entries(imported)) {
                if (data && typeof data === "object" && "keyCombo" in data) {
                  const shortcutData = data as { keyCombo: string[]; keyComboMac?: string[] };
                  setCustomShortcut(slug, shortcutData.keyCombo, shortcutData.keyComboMac);
                }
              }
              addNotification({
                type: "success",
                content: "Shortcuts imported successfully",
                dismissable: true
              });
            }
          } catch {
            addNotification({
              type: "error",
              content: "Failed to import shortcuts: invalid JSON",
              dismissable: true
            });
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }, [setCustomShortcut, addNotification]);

  const filteredShortcuts = useMemo(() => {
    let shortcuts = NODE_EDITOR_SHORTCUTS;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      shortcuts = shortcuts.filter(
        (s) =>
          s.title.toLowerCase().includes(term) ||
          s.slug.toLowerCase().includes(term) ||
          s.description?.toLowerCase().includes(term)
      );
    }

    if (selectedCategory !== "all") {
      shortcuts = shortcuts.filter((s) => s.category === selectedCategory);
    }

    return shortcuts;
  }, [searchTerm, selectedCategory]);

  const groupedShortcuts = useMemo(() => {
    const groups: Record<string, Shortcut[]> = {};
    for (const shortcut of filteredShortcuts) {
      if (!groups[shortcut.category]) {
        groups[shortcut.category] = [];
      }
      groups[shortcut.category].push(shortcut);
    }
    return groups;
  }, [filteredShortcuts]);

  return (
    <div css={styles(theme)}>
      <div className="header">
        <div className="search-bar">
          <SearchIcon sx={{ color: "text.secondary" }} />
          <TextField
            placeholder="Search shortcuts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            variant="outlined"
            size="small"
            fullWidth
          />
        </div>
        <div className="actions">
          <Button
            variant="outlined"
            startIcon={<ResetTvIcon />}
            onClick={handleResetAll}
            size="small"
          >
            Reset All
          </Button>
        </div>
      </div>

      <div className="filter-bar">
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <Select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            displayEmpty
            startAdornment={
              <ArrowDropDownIcon sx={{ color: "text.secondary", mr: 0.5 }} />
            }
          >
            <MenuItem value="all">All Categories</MenuItem>
            {Object.entries(SHORTCUT_CATEGORIES).map(([key, label]) => (
              <MenuItem key={key} value={key}>
                {label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Chip
          label={`${filteredShortcuts.length} shortcuts`}
          size="small"
          variant="outlined"
        />
        {searchTerm && (
          <Chip
            label={`Filtered: "${searchTerm}"`}
            size="small"
            onDelete={() => setSearchTerm("")}
          />
        )}
      </div>

      <div className="shortcuts-grid">
        {filteredShortcuts.map((shortcut) => (
          <ShortcutRow
            key={shortcut.slug}
            shortcut={shortcut}
            customShortcut={customShortcuts[shortcut.slug] || null}
            isEditing={editingShortcut?.slug === shortcut.slug}
            isMac={isMac}
            isConflicting={isConflicting}
            onEditStart={() => handleEditStart(shortcut)}
            onEditCancel={handleEditCancel}
            onEditComplete={handleEditComplete}
            onReset={() => handleReset(shortcut.slug, shortcut.title)}
          />
        ))}
      </div>

      {filteredShortcuts.length === 0 && (
        <Box sx={{ textAlign: "center", py: 4 }}>
          <Typography color="text.secondary">
            No shortcuts found matching your search.
          </Typography>
        </Box>
      )}

      <div className="export-import">
        <Typography variant="body2" sx={{ mr: 2 }}>
          Export or import your custom keyboard shortcuts:
        </Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<ContentCopyIcon />}
          onClick={handleExport}
        >
          Export
        </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<UploadFileIcon />}
            onClick={handleImport}
          >
          Import
        </Button>
      </div>

      <ShortcutConflictDialog
        open={conflictDialogOpen}
        conflicts={conflicts}
        onClose={() => setConflictDialogOpen(false)}
        onResolve={handleConflictResolve}
      />
    </div>
  );
};

export default KeyboardShortcutsSettings;
