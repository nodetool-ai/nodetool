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

  // Symbol mappings
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

  // Return mapped symbol or original (capitalized)
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
    // Build the display elements
    const elements: React.ReactNode[] = [];

    shortcut.forEach((key, index) => {
      const formattedKey = formatKey(key);

      // Add plus separator between keys (except before first key)
      if (index > 0) {
        elements.push(
          <span key={`plus-${index}`} style={{ margin: "0 1px", opacity: 0.7, fontWeight: 700 }}>
            +
          </span>
        );
      }

      // Add the key badge
      elements.push(
        <span
          key={`key-${index}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: size === "small" ? "14px" : "16px",
            height: size === "small" ? "14px" : "16px",
            padding: size === "small" ? "0 2px" : "0 3px",
            borderRadius: "2px",
            backgroundColor: "rgba(0, 0, 0, 0.08)",
            color: "inherit",
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
          borderRadius: "4px",
          fontSize: size === "small" ? "10px" : "11px",
          fontWeight: 500,
          letterSpacing: "0.5px",
          transition: "all 0.2s ease",
          opacity: 0.8,

          // Hover effect
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
