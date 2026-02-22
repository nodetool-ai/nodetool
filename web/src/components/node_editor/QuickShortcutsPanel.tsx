/** @jsxImportSource @emotion/react */
/**
 * QuickShortcutsPanel
 *
 * A floating panel that displays context-relevant keyboard shortcuts.
 * Shows shortcuts based on current user context (selected nodes, editor state, etc.).
 * Accessible via keyboard shortcut (Ctrl+H / Cmd+H).
 *
 * @example
 * <QuickShortcutsPanel open={isOpen} onClose={() => setOpen(false)} />
 */

import React, { memo, useCallback, useMemo } from "react";
import {
  Box,
  Typography,
  Fade,
  useTheme,
  IconButton
} from "@mui/material";
import { CloseRounded as CloseIcon } from "@mui/icons-material";
import { ShortcutHint } from "../ui_primitives/ShortcutHint";
import { NODE_EDITOR_SHORTCUTS } from "../../config/shortcuts";
import { useNodes } from "../../contexts/NodeContext";

export interface QuickShortcutsPanelProps {
  /** Whether the panel is open */
  open: boolean;
  /** Callback to close the panel */
  onClose: () => void;
  /** Optional position for the panel (defaults to top-right) */
  position?: { x: number; y: number };
}

interface ShortcutCategory {
  title: string;
  shortcuts: Array<{
    keys: string[];
    action: string;
  }>;
}

/**
 * Context-aware shortcuts panel component.
 *
 * This component displays a curated list of keyboard shortcuts that are
 * relevant to the current editor state. For example, when nodes are selected,
 * it shows node manipulation shortcuts. When no nodes are selected, it shows
 * general editor shortcuts.
 */
const QuickShortcutsPanelInternal: React.FC<QuickShortcutsPanelProps> = ({
  open,
  onClose,
  position
}) => {
  const theme = useTheme();

  // Get current editor state for context-aware shortcuts
  const { selectedNodeCount, nodes } = useNodes((state) => ({
    selectedNodeCount: state.getSelectedNodeCount(),
    nodes: state.nodes
  }));

  // Determine context based on editor state
  const context = useMemo(() => {
    if (selectedNodeCount > 1) {
      return "multiple-selected";
    } else if (selectedNodeCount === 1) {
      return "single-selected";
    } else if (nodes.length === 0) {
      return "empty-workflow";
    }
    return "default";
  }, [selectedNodeCount, nodes.length]);

  // Filter and categorize shortcuts based on context
  const categorizedShortcuts = useMemo<ShortcutCategory[]>(() => {
    const categories: ShortcutCategory[] = [];

    // Essential shortcuts (always shown)
    const shortcutsToShow = new Set<string>([
      "saveWorkflow",
      "findInWorkflow",
      "openNodeMenu",
      "fitView",
      "toggleInspector",
      "toggleWorkflowSettings",
      "showKeyboardShortcuts"
    ]);

    // Context-specific shortcuts
    if (context === "multiple-selected") {
      shortcutsToShow.add("align");
      shortcutsToShow.add("alignWithSpacing");
      shortcutsToShow.add("duplicate");
      shortcutsToShow.add("deleteSelected");
      shortcutsToShow.add("groupSelected");
      shortcutsToShow.add("bypassNode");
      shortcutsToShow.add("alignLeft");
      shortcutsToShow.add("alignRight");
      shortcutsToShow.add("alignTop");
      shortcutsToShow.add("alignBottom");
      shortcutsToShow.add("distributeHorizontal");
    } else if (context === "single-selected") {
      shortcutsToShow.add("duplicate");
      shortcutsToShow.add("deleteSelected");
      shortcutsToShow.add("bypassNode");
      shortcutsToShow.add("copy");
      shortcutsToShow.add("cut");
    } else if (context === "empty-workflow") {
      shortcutsToShow.add("openNodeMenu");
      shortcutsToShow.add("findInWorkflow");
      shortcutsToShow.add("newWorkflow");
      shortcutsToShow.add("toggleChat");
    } else {
      // Default context
      shortcutsToShow.add("selectAll");
      shortcutsToShow.add("duplicate");
      shortcutsToShow.add("openNodeMenu");
      shortcutsToShow.add("navigateNextNode");
      shortcutsToShow.add("zoomIn");
      shortcutsToShow.add("zoomOut");
      shortcutsToShow.add("resetZoom");
    }

    // Build categories from selected shortcuts
    const workflowShortcuts: ShortcutCategory["shortcuts"] = [];
    const editorShortcuts: ShortcutCategory["shortcuts"] = [];
    const _viewShortcuts: ShortcutCategory["shortcuts"] = [];
    const panelShortcuts: ShortcutCategory["shortcuts"] = [];

    for (const shortcut of NODE_EDITOR_SHORTCUTS) {
      if (!shortcutsToShow.has(shortcut.slug)) {
        continue;
      }

      const item = {
        keys: shortcut.keyCombo,
        action: shortcut.title
      };

      if (shortcut.category === "workflow") {
        workflowShortcuts.push(item);
      } else if (shortcut.category === "editor") {
        editorShortcuts.push(item);
      } else if (shortcut.category === "panel") {
        panelShortcuts.push(item);
      }
    }

    // Add context-specific header
    if (context === "multiple-selected") {
      categories.push({
        title: "Selection Shortcuts",
        shortcuts: editorShortcuts
      });
    } else if (context === "empty-workflow") {
      categories.push({
        title: "Getting Started",
        shortcuts: [...workflowShortcuts, ...editorShortcuts]
      });
    } else {
      if (workflowShortcuts.length > 0) {
        categories.push({
          title: "Workflow",
          shortcuts: workflowShortcuts
        });
      }
      if (editorShortcuts.length > 0) {
        categories.push({
          title: "Editor",
          shortcuts: editorShortcuts
        });
      }
    }

    if (panelShortcuts.length > 0) {
      categories.push({
        title: "Panels",
        shortcuts: panelShortcuts
      });
    }

    return categories;
  }, [context]);

  const panelStyle = useMemo(() => {
    const baseStyle = {
      position: "fixed" as const,
      zIndex: 10000,
      maxHeight: "70vh",
      overflowY: "auto" as const,
      backdropFilter: "blur(8px)",
      bgcolor: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.divider}`,
      boxShadow: theme.shadows[8],
      borderRadius: 2,
      p: 2
    };

    if (position) {
      return {
        ...baseStyle,
        top: position.y,
        left: position.x
      };
    }

    // Default position: top-right with margin
    return {
      ...baseStyle,
      top: 80,
      right: 24
    };
  }, [position, theme]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  const renderShortcutItem = (
    keys: string[],
    action: string,
    index: number
  ) => (
    <Box
      key={`${action}-${index}`}
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        py: 0.75,
        px: 1,
        borderRadius: 1,
        transition: "background-color 0.15s ease",
        "&:hover": {
          backgroundColor: theme.vars.palette.action.hover
        }
      }}
    >
      <Typography
        variant="body2"
        sx={{
          color: theme.vars.palette.text.primary,
          fontWeight: 400
        }}
      >
        {action}
      </Typography>
      <ShortcutHint
        shortcut={keys}
        size="small"
        sx={{
          ml: 2
        }}
      />
    </Box>
  );

  return (
    <Fade in={open} timeout={200}>
      <Box sx={panelStyle} onKeyDown={handleKeyDown}>
        {/* Header */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 2,
            pb: 1.5,
            borderBottom: `1px solid ${theme.vars.palette.divider}`
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1
            }}
          >
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                fontSize: "0.7rem",
                color: theme.vars.palette.text.secondary
              }}
            >
              Quick Shortcuts
            </Typography>
            {context !== "default" && (
              <Typography
                variant="caption"
                sx={{
                  px: 1,
                  py: 0.25,
                  borderRadius: 1,
                  backgroundColor: theme.vars.palette.primary.main,
                  color: theme.vars.palette.primary.contrastText,
                  fontSize: "0.65rem",
                  fontWeight: 500,
                  textTransform: "uppercase"
                }}
              >
                {context === "multiple-selected"
                  ? "Multi-Select"
                  : context === "single-selected"
                  ? "1 Selected"
                  : context === "empty-workflow"
                  ? "Empty"
                  : ""}
              </Typography>
            )}
          </Box>
          <IconButton
            size="small"
            onClick={onClose}
            aria-label="Close shortcuts panel"
            sx={{
              color: theme.vars.palette.text.secondary
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Shortcuts by category */}
        {categorizedShortcuts.map((category, categoryIndex) => (
          <Box
            key={categoryIndex}
            sx={{
              mb: categoryIndex < categorizedShortcuts.length - 1 ? 2 : 0
            }}
          >
            <Typography
              variant="caption"
              sx={{
                display: "block",
                mb: 1,
                fontWeight: 600,
                color: theme.vars.palette.text.secondary,
                textTransform: "uppercase",
                fontSize: "0.65rem",
                letterSpacing: "0.5px"
              }}
            >
              {category.title}
            </Typography>
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 0.25
              }}
            >
              {category.shortcuts.map((shortcut, shortcutIndex) =>
                renderShortcutItem(shortcut.keys, shortcut.action, shortcutIndex)
              )}
            </Box>
          </Box>
        ))}

        {/* Footer hint */}
        <Box
          sx={{
            mt: 2,
            pt: 1.5,
            borderTop: `1px dashed ${theme.vars.palette.divider}`
          }}
        >
          <Typography
            variant="caption"
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 0.5,
              color: theme.vars.palette.text.secondary,
              fontSize: "0.7rem"
            }}
          >
            Press <ShortcutHint shortcut={["Escape"]} size="small" /> to close
          </Typography>
        </Box>
      </Box>
    </Fade>
  );
};

export const QuickShortcutsPanel = memo(QuickShortcutsPanelInternal);

export default QuickShortcutsPanel;
