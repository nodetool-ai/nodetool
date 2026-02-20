/** @jsxImportSource @emotion/react */
/**
 * ShortcutTipToast
 *
 * A toast notification component for displaying keyboard shortcut tips.
 * Shows a helpful keyboard shortcut with its description in a non-intrusive way.
 *
 * @example
 * <ShortcutTipToast
 *   tip={{
 *     id: "save-workflow",
 *     shortcut: { title: "Save", keys: ["Ctrl", "S"], description: "Save workflow" },
 *     category: "general",
 *     priority: 10,
 *     showCount: 0,
 *     dismissed: false
 *   }}
 *   onDismiss={() => {}}
 * />
 */

import React, { memo, useCallback, useEffect, useState } from "react";
import {
  Box,
  Fade,
  IconButton,
  Paper,
  Typography,
  useTheme
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import { ShortcutHint } from "../ui_primitives/ShortcutHint";
import type { ShortcutTip } from "../../stores/ShortcutTipStore";

export interface ShortcutTipToastProps {
  /** The tip to display */
  tip: ShortcutTip | null;
  /** Callback when tip is dismissed */
  onDismiss: () => void;
  /** Auto-dismiss timeout in milliseconds (0 to disable) */
  autoDismissTimeout?: number;
  /** Position of the toast */
  position?: "bottom-left" | "bottom-right" | "top-left" | "top-right";
  /** Whether to show the category badge */
  showCategory?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  general: "General",
  editor: "Editor",
  workflow: "Workflow",
  panel: "Panels",
  navigation: "Navigation",
  selection: "Selection"
};

const CATEGORY_COLORS: Record<string, string> = {
  general: "#1976d2",
  editor: "#7c4dff",
  workflow: "#009688",
  panel: "#ff9800",
  navigation: "#4caf50",
  selection: "#f44336"
};

/**
 * Toast notification component for keyboard shortcut tips.
 *
 * Displays a keyboard shortcut with its title and description in a floating
 * toast notification. Automatically dismisses after a timeout and includes
 * a close button for manual dismissal.
 */
const ShortcutTipToastInternal: React.FC<ShortcutTipToastProps> = ({
  tip,
  onDismiss,
  autoDismissTimeout = 8000,
  position = "bottom-left",
  showCategory = true
}) => {
  const theme = useTheme();
  const [visible, setVisible] = useState(false);

  // Auto-dismiss effect
  useEffect(() => {
    if (!tip) {
      setVisible(false);
      return;
    }

    // Small delay before showing for smooth animation
    const showTimer = setTimeout(() => {
      setVisible(true);
    }, 100);

    // Auto-dismiss timer
    let dismissTimer: ReturnType<typeof setTimeout> | undefined;
    if (autoDismissTimeout > 0) {
      dismissTimer = setTimeout(() => {
        setVisible(false);
        setTimeout(onDismiss, 300); // Wait for fade out
      }, autoDismissTimeout);
    }

    return () => {
      clearTimeout(showTimer);
      if (dismissTimer) {
        clearTimeout(dismissTimer);
      }
    };
  }, [tip, autoDismissTimeout, onDismiss]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setTimeout(onDismiss, 300); // Wait for fade out animation
  }, [onDismiss]);

  if (!tip) {
    return null;
  }

  // Calculate position styles
  const getPositionStyles = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: "fixed",
      zIndex: 2000,
      maxWidth: 400
    };

    switch (position) {
      case "bottom-left":
        return { ...base, bottom: theme.spacing(2), left: theme.spacing(2) };
      case "bottom-right":
        return { ...base, bottom: theme.spacing(2), right: theme.spacing(2) };
      case "top-left":
        return { ...base, top: theme.spacing(2), left: theme.spacing(2) };
      case "top-right":
        return { ...base, top: theme.spacing(2), right: theme.spacing(2) };
      default:
        return { ...base, bottom: theme.spacing(2), left: theme.spacing(2) };
    }
  };

  const categoryColor = CATEGORY_COLORS[tip.category] ?? CATEGORY_COLORS.general;

  return (
    <Fade in={visible} timeout={{ enter: 300, exit: 300 }}>
      <Paper
        elevation={6}
        sx={{
          ...getPositionStyles(),
          backgroundColor: theme.vars.palette.background.paper,
          borderRadius: (theme.shape.borderRadius as number) * 2,
          overflow: "hidden",
          border: `1px solid ${theme.vars.palette.divider}`,
          boxShadow: `0 8px 32px ${theme.vars.palette.common.black}10`
        }}
      >
        {/* Category bar */}
        <Box
          sx={{
            height: 4,
            backgroundColor: categoryColor,
            width: "100%"
          }}
        />

        <Box
          sx={{
            p: 2,
            display: "flex",
            alignItems: "flex-start",
            gap: 1.5
          }}
        >
          {/* Content */}
          <Box
            sx={{
              flex: 1,
              minWidth: 0
            }}
          >
            {/* Header with title and category */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                mb: 0.5
              }}
            >
              {showCategory && (
                <Box
                  sx={{
                    px: 0.75,
                    py: 0.25,
                    borderRadius: 1,
                    backgroundColor: `${categoryColor}20`,
                    color: categoryColor,
                    fontSize: "0.65rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    whiteSpace: "nowrap"
                  }}
                >
                  {CATEGORY_LABELS[tip.category] ?? tip.category}
                </Box>
              )}
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 600,
                  color: theme.vars.palette.text.primary
                }}
              >
                Pro Tip
              </Typography>
            </Box>

            {/* Shortcut title */}
            <Typography
              variant="body2"
              sx={{
                fontWeight: 500,
                color: theme.vars.palette.text.primary,
                mb: 0.5
              }}
            >
              {tip.shortcut.title}
            </Typography>

            {/* Description */}
            {tip.shortcut.description && (
              <Typography
                variant="caption"
                sx={{
                  color: theme.vars.palette.text.secondary,
                  display: "block",
                  lineHeight: 1.4,
                  mb: 1
                }}
              >
                {tip.shortcut.description}
              </Typography>
            )}

            {/* Keyboard shortcut hint */}
            <ShortcutHint
              shortcut={tip.shortcut.keys}
              size="small"
              sx={{ mt: 0.5 }}
            />
          </Box>

          {/* Close button */}
          <IconButton
            size="small"
            onClick={handleDismiss}
            aria-label="Dismiss tip"
            sx={{
              color: theme.vars.palette.text.secondary,
              flexShrink: 0,
              p: 0.5,
              "&:hover": {
                backgroundColor: `${theme.vars.palette.action.hover}40`
              }
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </Paper>
    </Fade>
  );
};

export const ShortcutTipToast = memo(ShortcutTipToastInternal);
export default ShortcutTipToast;
