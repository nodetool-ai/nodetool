import { memo, useCallback, useState, useMemo } from "react";
import {
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  Tabs,
  Tab,
  Divider
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import {
  NODE_EDITOR_SHORTCUTS,
  SHORTCUT_CATEGORIES,
  getShortcutTooltip
} from "../../config/shortcuts";

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = memo(function TabPanel({
  children,
  value,
  index
}) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`shortcuts-tabpanel-${index}`}
      aria-labelledby={`shortcuts-tab-${index}`}
    >
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
});

const a11yTabProps = (index: number) => ({
  id: `shortcuts-tab-${index}`,
  "aria-controls": `shortcuts-tabpanel-${index}`
});

/**
 * KeyboardShortcutsDialog - A dialog displaying all available keyboard shortcuts
 *
 * Features:
 * - Categorized tabs for different shortcut types
 * - Search/filter functionality
 * - Visual key combination display
 * - Responsive design
 */
const KeyboardShortcutsDialog: React.FC<KeyboardShortcutsDialogProps> = memo(
  function KeyboardShortcutsDialog({ open, onClose }) {
    const theme = useTheme();
    const [tabValue, setTabValue] = useState(0);
    const [searchQuery, setSearchQuery] = useState("");

    const categories = useMemo(
      () => Object.entries(SHORTCUT_CATEGORIES),
      []
    );

    const handleTabChange = useCallback(
      (_event: React.SyntheticEvent, newValue: number) => {
        setTabValue(newValue);
      },
      []
    );

    const handleSearchChange = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(event.target.value);
        // Switch to first tab when searching
        if (event.target.value && tabValue !== 0) {
          setTabValue(0);
        }
      },
      [tabValue]
    );

    const filteredShortcuts = useMemo(() => {
      if (!searchQuery.trim()) {
        return NODE_EDITOR_SHORTCUTS;
      }

      const query = searchQuery.toLowerCase();
      return NODE_EDITOR_SHORTCUTS.filter(
        (shortcut) =>
          shortcut.title.toLowerCase().includes(query) ||
          shortcut.description?.toLowerCase().includes(query) ||
          shortcut.keyCombo.some((key) => key.toLowerCase().includes(query))
      );
    }, [searchQuery]);

    const shortcutsByCategory = useMemo(() => {
      const grouped: Record<string, typeof NODE_EDITOR_SHORTCUTS> = {};

      filteredShortcuts.forEach((shortcut) => {
        const category = shortcut.category;
        if (!grouped[category]) {
          grouped[category] = [];
        }
        grouped[category].push(shortcut);
      });

      return grouped;
    }, [filteredShortcuts]);

    const renderShortcutRow = useCallback(
      (shortcut: (typeof NODE_EDITOR_SHORTCUTS)[number], index: number) => (
        <Box
          key={`${shortcut.slug}-${index}`}
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            py: 1.5,
            px: 1,
            borderRadius: 1,
            transition: "background-color 0.15s ease",
            "&:hover": {
              backgroundColor: theme.vars.palette.action.hover
            }
          }}
        >
          <Box sx={{ flex: 1, mr: 2 }}>
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
                sx={{
                  color: theme.vars.palette.text.secondary,
                  display: "block",
                  fontSize: "0.75rem"
                }}
              >
                {shortcut.description}
              </Typography>
            )}
          </Box>
          <Box
            sx={{
              display: "flex",
              gap: 0.5,
              alignItems: "center",
              flexWrap: "wrap",
              justifyContent: "flex-end"
            }}
          >
            {getShortcutTooltip(shortcut.slug, "both", "combo")}
          </Box>
        </Box>
      ),
      [theme]
    );

    const renderShortcutsList = useCallback(
      (categoryKey: string) => {
        const shortcuts = shortcutsByCategory[categoryKey];

        if (!shortcuts || shortcuts.length === 0) {
          return (
            <Box
              sx={{
                textAlign: "center",
                py: 4,
                color: theme.vars.palette.text.secondary
              }}
            >
              <Typography variant="body2">
                {searchQuery ? "No shortcuts found" : "No shortcuts in this category"}
              </Typography>
            </Box>
          );
        }

        return (
          <Box>
            {shortcuts.map((shortcut, index) =>
              renderShortcutRow(shortcut, index)
            )}
          </Box>
        );
      },
      [shortcutsByCategory, searchQuery, renderShortcutRow, theme]
    );

    return (
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
            maxHeight: "80vh"
          },
          "data-testid": "keyboard-shortcuts-dialog"
        }}
      >
        <DialogTitle
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            pb: 1
          }}
        >
          <Typography variant="h6" component="div">
            Keyboard Shortcuts
          </Typography>
          <Box
            onClick={onClose}
            sx={{
              cursor: "pointer",
              color: theme.vars.palette.text.secondary,
              "&:hover": {
                color: theme.vars.palette.text.primary
              }
            }}
          >
            <CloseIcon />
          </Box>
        </DialogTitle>

        <DialogContent sx={{ pb: 1 }}>
          {/* Search Field */}
          <TextField
            fullWidth
            placeholder="Search shortcuts..."
            value={searchQuery}
            onChange={handleSearchChange}
            autoFocus
            size="small"
            sx={{ mb: 2 }}
            InputProps={{
              "aria-label": "Search keyboard shortcuts"
            }}
            data-testid="shortcuts-search-input"
          />

          {/* Category Tabs */}
          {!searchQuery && (
            <Tabs
              value={tabValue}
              onChange={handleTabChange}
              variant="scrollable"
              scrollButtons="auto"
              sx={{
                borderBottom: 1,
                borderColor: "divider",
                mb: 1
              }}
            >
              {categories.map(([key, label], index) => (
                <Tab
                  key={key}
                  label={label}
                  {...a11yTabProps(index)}
                  sx={{
                    textTransform: "none",
                    fontWeight: tabValue === index ? 600 : 400,
                    fontSize: "0.875rem"
                  }}
                />
              ))}
            </Tabs>
          )}

          {/* Tab Panels */}
          {!searchQuery ? (
            categories.map(([key], index) => (
              <TabPanel key={key} value={tabValue} index={index}>
                {renderShortcutsList(key)}
              </TabPanel>
            ))
          ) : (
            // Show all categories when searching
            <Box>
              {categories.map(([key, label]) => {
                const shortcuts = shortcutsByCategory[key];
                if (!shortcuts || shortcuts.length === 0) {
                  return null;
                }
                return (
                  <Box key={key} sx={{ mb: 3 }}>
                    <Typography
                      variant="subtitle2"
                      sx={{
                        fontWeight: 600,
                        mb: 1.5,
                        color: theme.vars.palette.text.primary,
                        textTransform: "uppercase",
                        fontSize: "0.75rem",
                        letterSpacing: "0.05em"
                      }}
                    >
                      {label}
                    </Typography>
                    {renderShortcutsList(key)}
                    {key !== categories[categories.length - 1][0] && (
                      <Divider sx={{ my: 2 }} />
                    )}
                  </Box>
                );
              })}
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2, pt: 1 }}>
          <Button
            onClick={onClose}
            variant="contained"
            sx={{
              textTransform: "none",
              borderRadius: 1.5
            }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    );
  }
);

export default KeyboardShortcutsDialog;
