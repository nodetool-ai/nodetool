/**
 * KeyboardShortcutsDialog
 *
 * A searchable, filterable dialog showing all available keyboard shortcuts.
 * Helps users discover and learn the many keyboard shortcuts available in NodeTool.
 */

import { memo, useCallback, useMemo, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  TextField,
  Chip,
  Typography,
  List,
  ListItem,
  Divider,
  Paper
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  NODE_EDITOR_SHORTCUTS,
  SHORTCUT_CATEGORIES,
  type Shortcut
} from "../../config/shortcuts";
import { useKeyboardShortcutsStore } from "../../stores/KeyboardShortcutsStore";

interface KeyboardShortcutsDialogProps {
  /** Optional additional CSS class name */
  className?: string;
}

type CategoryFilter = Shortcut["category"] | "all";

const CATEGORY_FILTERS: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "editor", label: "Node Editor" },
  { value: "panel", label: "Panels" },
  { value: "workflow", label: "Workflows" },
  { value: "assets", label: "Asset Viewer" }
];

/**
 * Formats a key combination for display in a chip.
 * Converts technical key names to readable symbols.
 */
const formatKeyCombo = (keys: string[]): string => {
  return keys
    .map((key) => {
      const normalized = key.toLowerCase();
      switch (normalized) {
        case "control":
          return "⌃";
        case "meta":
          return "⌘";
        case "alt":
        case "option":
          return "⌥";
        case "shift":
          return "⇧";
        case "space":
          return "␣";
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
          return "⎋";
        case "enter":
          return "↵";
        case "delete":
          return "⌫";
        case "backspace":
          return "⌫";
        case "tab":
          return "⇥";
        case "pageup":
          return "⇞";
        case "pagedown":
          return "⇟";
        default:
          return key.length === 1 ? key.toUpperCase() : key;
      }
    })
    .join(" + ");
};

const KeyboardShortcutsDialog: React.FC<KeyboardShortcutsDialogProps> = memo(
  function KeyboardShortcutsDialog({ className }: KeyboardShortcutsDialogProps) {
    const theme = useTheme();
    const { isDialogOpen, closeDialog } = useKeyboardShortcutsStore();

    const [searchQuery, setSearchQuery] = useState("");
    const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");

    /**
     * Filters shortcuts based on search query and category selection.
     * Searches in title, slug, and description.
     */
    const filteredShortcuts = useMemo(() => {
      let filtered = NODE_EDITOR_SHORTCUTS;

      // Apply category filter
      if (categoryFilter !== "all") {
        filtered = filtered.filter((s) => s.category === categoryFilter);
      }

      // Apply search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(
          (s) =>
            s.title.toLowerCase().includes(query) ||
            s.slug.toLowerCase().includes(query) ||
            s.description?.toLowerCase().includes(query) ||
            s.keyCombo.some((k) => k.toLowerCase().includes(query))
        );
      }

      // Group by category for display
      return filtered.reduce<Record<string, Shortcut[]>>((acc, shortcut) => {
        const category = shortcut.category;
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(shortcut);
        return acc;
      }, {});
    }, [searchQuery, categoryFilter]);

    const handleSearchChange = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(event.target.value);
      },
      []
    );

    const handleCategoryClick = useCallback(
      (value: CategoryFilter) => () => {
        setCategoryFilter((prev) => (prev === value ? "all" : value));
      },
      []
    );

    const handleClose = useCallback(() => {
      closeDialog();
      setSearchQuery("");
      setCategoryFilter("all");
    }, [closeDialog]);

    /**
     * Renders a keyboard shortcut item with its key combination.
     */
    const renderShortcutItem = useCallback(
      (shortcut: Shortcut) => (
        <ListItem
          key={shortcut.slug}
          sx={{
            px: 2,
            py: 1.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            "&:hover": {
              backgroundColor: theme.vars.palette.action.hover
            }
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              component="div"
              sx={{ fontWeight: 500, mb: 0.25 }}
            >
              {shortcut.title}
            </Typography>
            {shortcut.description && (
              <Typography
                variant="caption"
                component="div"
                sx={{
                  color: theme.vars.palette.text.secondary,
                  fontSize: "0.75rem",
                  lineHeight: 1.3
                }}
              >
                {shortcut.description}
              </Typography>
            )}
          </Box>
          <Box
            sx={{
              ml: 2,
              display: "flex",
              gap: 0.5,
              flexShrink: 0
            }}
          >
            <Chip
              label={formatKeyCombo(shortcut.keyCombo)}
              size="small"
              sx={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: "0.7rem",
                height: 24,
                backgroundColor: theme.vars.palette.action.selected,
                "& .MuiChip-label": {
                  px: 1
                }
              }}
            />
            {shortcut.altKeyCombos &&
              shortcut.altKeyCombos.map((altCombo, idx) => (
                <Chip
                  key={`alt-${idx}`}
                  label={formatKeyCombo(altCombo)}
                  size="small"
                  sx={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: "0.7rem",
                    height: 24,
                    backgroundColor: theme.vars.palette.action.selected,
                    opacity: 0.8,
                    "& .MuiChip-label": {
                      px: 1
                    }
                  }}
                />
              ))}
          </Box>
        </ListItem>
      ),
      [theme]
    );

    return (
      <Dialog
        open={isDialogOpen}
        onClose={handleClose}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: "12px",
            maxHeight: "80vh"
          },
          className
        }}
      >
        <DialogTitle
          sx={{
            pb: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          <Typography variant="h6" component="div">
            Keyboard Shortcuts
          </Typography>
        </DialogTitle>

        <DialogContent sx={{ pb: 2 }}>
          {/* Search Input */}
          <TextField
            fullWidth
            placeholder="Search shortcuts..."
            value={searchQuery}
            onChange={handleSearchChange}
            autoFocus
            size="small"
            sx={{ mb: 2 }}
            InputProps={{
              sx: {
                borderRadius: "8px"
              }
            }}
          />

          {/* Category Filter Chips */}
          <Box
            sx={{
              display: "flex",
              gap: 1,
              flexWrap: "wrap",
              mb: 2
            }}
          >
            {CATEGORY_FILTERS.map((filter) => (
              <Chip
                key={filter.value}
                label={filter.label}
                onClick={handleCategoryClick(filter.value)}
                size="small"
                color={
                  categoryFilter === filter.value ? "primary" : "default"
                }
                variant={categoryFilter === filter.value ? "filled" : "outlined"}
                sx={{
                  borderRadius: "16px",
                  textTransform: "capitalize"
                }}
              />
            ))}
          </Box>

          {/* Shortcuts List */}
          <Paper
            variant="outlined"
            sx={{
              maxHeight: "50vh",
              overflow: "auto",
              borderColor: theme.vars.palette.divider
            }}
          >
            {Object.entries(filteredShortcuts).length === 0 ? (
              <Box
                sx={{
                  py: 8,
                  textAlign: "center",
                  color: theme.vars.palette.text.secondary
                }}
              >
                <Typography variant="body2">
                  No shortcuts found matching &quot;{searchQuery}&quot;
                </Typography>
              </Box>
            ) : (
              <List disablePadding>
                {Object.entries(filteredShortcuts).map(
                  ([category, shortcuts], categoryIdx) => (
                    <Box key={category}>
                      {/* Category Header */}
                      <Box
                        sx={{
                          position: "sticky",
                          top: 0,
                          zIndex: 1,
                          py: 1,
                          px: 2,
                          backgroundColor: theme.vars.palette.background.paper,
                          borderBottom: `1px solid ${theme.vars.palette.divider}`
                        }}
                      >
                        <Typography
                          variant="subtitle2"
                          sx={{
                            fontWeight: 600,
                            color: theme.vars.palette.text.secondary,
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                            fontSize: "0.7rem"
                          }}
                        >
                          {SHORTCUT_CATEGORIES[category as keyof typeof SHORTCUT_CATEGORIES] ||
                            category}
                        </Typography>
                      </Box>

                      {/* Shortcuts in this category */}
                      {shortcuts.map(renderShortcutItem)}

                      {categoryIdx <
                        Object.entries(filteredShortcuts).length - 1 && (
                        <Divider />
                      )}
                    </Box>
                  )
                )}
              </List>
            )}
          </Paper>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} variant="contained">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    );
  }
);

export default KeyboardShortcutsDialog;
