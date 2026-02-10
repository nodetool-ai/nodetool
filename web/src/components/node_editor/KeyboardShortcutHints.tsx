/** @jsxImportSource @emotion/react */
import React, { memo, useMemo } from "react";
import { Box, Tooltip, Fade } from "@mui/material";
import { useTheme, type Theme } from "@mui/material/styles";
import { css } from "@emotion/react";
import { getShortcutTooltip } from "../../config/shortcuts";
import { isMac } from "../../utils/platform";
import isEqual from "lodash/isEqual";

/**
 * Props for the KeyboardShortcutHints component.
 */
interface KeyboardShortcutHintsProps {
  /** Array of shortcut slugs to display as hints */
  shortcutSlugs: string[];
  /** Optional className for custom styling */
  className?: string;
  /** Position of the hints container */
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /** Whether to show the hints with animation */
  animated?: boolean;
}

const styles = (theme: Theme) =>
  css({
    position: "absolute",
    zIndex: 1000,
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(0.5),
    padding: theme.spacing(1),
    borderRadius: theme.spacing(0.75),
    backgroundColor: theme.vars.palette.background.paper,
    border: `1px solid ${theme.vars.palette.divider}`,
    boxShadow: theme.shadows[2],
    transition: "opacity 0.2s ease, transform 0.2s ease",
    maxWidth: "300px",
    "&.top-left": {
      top: theme.spacing(2),
      left: theme.spacing(2)
    },
    "&.top-right": {
      top: theme.spacing(2),
      right: theme.spacing(2)
    },
    "&.bottom-left": {
      bottom: theme.spacing(2),
      left: theme.spacing(2)
    },
    "&.bottom-right": {
      bottom: theme.spacing(2),
      right: theme.spacing(2)
    },
    ".hint-item": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing(1),
      fontSize: "0.75rem",
      color: theme.vars.palette.text.secondary,
      padding: theme.spacing(0.25, 0.5),
      borderRadius: theme.spacing(0.25),
      transition: "background-color 0.15s ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    ".hint-label": {
      flex: 1,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    },
    ".hint-combo": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(0.25),
      flexShrink: 0
    },
    ".hint-combo kbd": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: "1.5em",
      height: "1.5em",
      padding: "0 0.4em",
      fontSize: "0.65em",
      fontWeight: 600,
      lineHeight: 1,
      fontFamily: theme.typography.fontFamily,
      backgroundColor: theme.vars.palette.action.selected,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: "3px",
      color: theme.vars.palette.text.primary
    }
  });

/**
 * KeyboardShortcutHints Component
 *
 * Displays contextual keyboard shortcut hints in a floating panel.
 * Shows relevant shortcuts based on the current editor state (e.g., when nodes are selected).
 *
 * Features:
 * - Compact display of keyboard shortcuts
 * - Configurable positioning
 * - Optional fade-in animation
 * - Auto-detects OS for correct key display (Mac/Windows)
 *
 * @example
 * ```tsx
 * <KeyboardShortcutHints
 *   shortcutSlugs={["copy", "paste", "duplicate", "deleteNode"]}
 *   position="top-right"
 *   animated
 * />
 * ```
 */
const KeyboardShortcutHints: React.FC<KeyboardShortcutHintsProps> = memo(
  ({ shortcutSlugs, className = "", position = "bottom-right", animated = true }) => {
    const theme = useTheme();
    const os = isMac() ? "mac" : "win";

    // Filter out empty or undefined slugs
    const validSlugs = useMemo(
      () => shortcutSlugs.filter(Boolean),
      [shortcutSlugs]
    );

    // Don't render if no hints to show
    if (validSlugs.length === 0) {
      return null;
    }

    const positionClass = `${position}`;
    const combinedClassName = `keyboard-shortcut-hints ${positionClass} ${className}`.trim();

    return (
      <Fade in={animated} timeout={{ enter: 300, exit: 200 }}>
        <Box css={styles(theme)} className={combinedClassName}>
          {validSlugs.map((slug) => {
            const tooltip = getShortcutTooltip(slug, os, "combo");
            const title = typeof tooltip === "string" ? slug : slug;

            return (
              <Tooltip
                key={slug}
                title={typeof tooltip === "object" && tooltip.props?.children ? tooltip : slug}
                arrow
                placement="left"
              >
                <Box className="hint-item">
                  <span className="hint-label">{title}</span>
                  <span className="hint-combo">
                    {typeof tooltip === "object" ? tooltip : <kbd>{title}</kbd>}
                  </span>
                </Box>
              </Tooltip>
            );
          })}
        </Box>
      </Fade>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison for memo to prevent unnecessary re-renders
    return (
      prevProps.position === nextProps.position &&
      prevProps.animated === nextProps.animated &&
      prevProps.className === nextProps.className &&
      isEqual(prevProps.shortcutSlugs, nextProps.shortcutSlugs)
    );
  }
);

KeyboardShortcutHints.displayName = "KeyboardShortcutHints";

export default KeyboardShortcutHints;
