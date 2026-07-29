/** @jsxImportSource @emotion/react */
/**
 * ShortcutHint
 *
 * A small badge component that displays keyboard shortcut hints.
 * Shows keyboard combinations in a compact, visually consistent format.
 *
 * @example
 * <ShortcutHint shortcut={["Ctrl", "S"]} />
 * <ShortcutHint shortcut={["⌘", "Enter"]} />
 */

import React, { memo } from "react";
import { Box, BoxProps } from "@mui/material";
import { MOTION } from "./tokens";

export interface ShortcutHintProps extends BoxProps {
  /**
   * The keyboard shortcut to display.
   * Array of key names, e.g., ["Ctrl", "S"] or ["⌘", "Enter"]
   */
  shortcut: string[];
  /**
   * Size variant for the hint
   * @default "small"
   */
  size?: "small" | "medium";
}

/**
 * Convert common key names to their display symbols
 */
const formatKey = (key: string): string => {
  const normalized = key.toLowerCase();

  const symbolMap: Record<string, string> = {
    "ctrl": "Ctrl",
    "control": "Ctrl",
    "meta": "⌘",
    "cmd": "⌘",
    "command": "⌘",
    "alt": "Alt",
    "option": "⌥",
    "opt": "⌥",
    "shift": "⇧",
    "enter": "↵",
    "return": "↵",
    "escape": "⎋",
    "esc": "⎋",
    "backspace": "⌫",
    "delete": "⌦",
    "del": "⌦",
    "tab": "⇥",
    "space": "␣",
    "arrowup": "↑",
    "arrowdown": "↓",
    "arrowleft": "←",
    "arrowright": "→",
    "up": "↑",
    "down": "↓",
    "left": "←",
    "right": "→",
  };

  return symbolMap[normalized] || key.charAt(0).toUpperCase() + key.slice(1);
};

/**
 * A compact keyboard shortcut badge component.
 *
 * Displays keyboard shortcuts in a visually consistent format,
 * perfect for use inside tooltips or next to action buttons.
 *
 * Automatically formats common keys (Ctrl, Alt, Shift, Enter, etc.)
 * into their appropriate symbols or abbreviations.
 */
export const ShortcutHint: React.FC<ShortcutHintProps> = memo(
  ({ shortcut, size = "small", className, sx, ...props }) => {
    const elements: React.ReactNode[] = [];

    shortcut.forEach((key, index) => {
      const formattedKey = formatKey(key);

      if (index > 0) {
        elements.push(
          <span key={`plus-${key}-${index}`} style={{ margin: "0 1px", opacity: 0.7, fontWeight: 600, transition: MOTION.normal }}>
            +
          </span>
        );
      }

      elements.push(
        <span
          key={`key-${key}-${index}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: size === "small" ? "14px" : "16px",
            height: size === "small" ? "14px" : "16px",
            padding: size === "small" ? "0 2px" : "0 3px",
            borderRadius: "var(--rounded-xs)",
            backgroundColor: "rgba(0, 0, 0, 0.08)",
            color: "inherit",
            transition: MOTION.normal,
            fontWeight: 600,
            fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
          }}
        >
          {formattedKey}
        </span>
      );
    });

    return (
      <Box
        className={`shortcut-hint ${className || ""}`}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: size === "small" ? "2px" : "4px",
          padding: size === "small" ? "2px 4px" : "4px 6px",
          borderRadius: "var(--rounded-sm)",
          fontSize: "var(--fontSizeSmaller)",
          fontWeight: 500,
          letterSpacing: "0.5px",
          transition: MOTION.all,
          opacity: 0.8,
          "&:hover": {
            opacity: 1,
            backgroundColor: "rgba(0, 0, 0, 0.12)",
          },

          ...sx,
        }}
        {...props}
      >
        {elements}
      </Box>
    );
  }
);

ShortcutHint.displayName = "ShortcutHint";

export default ShortcutHint;
