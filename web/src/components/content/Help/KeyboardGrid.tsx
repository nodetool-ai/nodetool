import React, { useMemo } from "react";
import { Box, Tooltip, ButtonBase } from "@mui/material";
import { Shortcut } from "../../../config/shortcuts";
import { expandShortcutsForOS } from "../../../config/shortcuts";
import { getShortcutTooltip } from "../../../config/shortcuts";

interface Props {
  shortcuts: Shortcut[];
  os: "mac" | "win";
}

// Physical keyboard rows for Windows/Linux
const ROWS_WIN: string[][] = [
  [
    "escape",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "0",
    "-",
    "=",
    "backspace"
  ],
  ["tab", "q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "[", "]", "\\"],
  ["capslock", "a", "s", "d", "f", "g", "h", "j", "k", "l", ";", "'", "enter"],
  ["shift", "z", "x", "c", "v", "b", "n", "m", ",", ".", "/", "shift"],
  ["control", "alt", "meta", "space", "alt", "control"]
];

// macOS bottom row differs
const ROWS_MAC: string[][] = [
  ...ROWS_WIN.slice(0, 4),
  ["fn", "control", "alt", "meta", "space", "meta", "alt"]
];

const labelForKey = (key: string, os: "mac" | "win") => {
  switch (key) {
    case "backspace":
      return "⌫";
    case "capslock":
      return "⇪";
    case "shift":
      return "⇧";
    case "control":
      return os === "mac" ? "⌃" : "Ctrl";
    case "meta":
      return os === "mac" ? "⌘" : "Win";
    case "alt":
      return os === "mac" ? "⌥" : "Alt";
    case "enter":
      return "⏎";
    case "space":
      return "Space";
    case "escape":
      return "Esc";
    case "fn":
      return "fn";
    default:
      return key.length === 1 ? key.toUpperCase() : key;
  }
};

const KeyboardGrid: React.FC<Props> = ({ shortcuts, os }) => {
  const activeShortcuts = useMemo(
    () => expandShortcutsForOS(shortcuts, os === "mac"),
    [shortcuts, os]
  );

  const keySlugMap: Record<string, string[]> = useMemo(() => {
    const map: Record<string, string[]> = {};
    activeShortcuts.forEach((s) => {
      const combo = s.keyCombo.map((k) => k.toLowerCase());
      combo.forEach((k) => {
        if (!map[k]) {map[k] = [];}
        map[k].push(s.slug);
      });
    });
    return map;
  }, [activeShortcuts]);

  const rows = os === "mac" ? ROWS_MAC : ROWS_WIN;

  return (
    <Box
      sx={{ display: "flex", flexDirection: "column", gap: 0.5, width: "100%" }}
    >
      {rows.map((row: string[], rowIdx: number) => (
        <Box
          key={rowIdx}
          sx={{
            display: "grid",
            gridTemplateColumns: `repeat(${row.length}, 1fr)`,
            gap: 0.5,
            width: "100%"
          }}
        >
          {row.map((key: string, idx: number) => {
            const slugList = keySlugMap[key] || [];
            const hasShortcut = slugList.length > 0;
            const tooltipContent = hasShortcut
              ? getShortcutTooltip(slugList[0])
              : "";
            const btn = (
              <ButtonBase
                key={idx}
                className={hasShortcut ? "grid-key has-shortcut" : "grid-key"}
                sx={{
                  width: "100%",
                  px: 0.5,
                  py: 0.75,
                  borderRadius: 0.75,
                  border: "1px solid",
                  borderColor: "divider",
                  backgroundColor: "background.paper",
                  fontSize: "0.8rem",
                  whiteSpace: "nowrap"
                }}
              >
                {labelForKey(key, os)}
              </ButtonBase>
            );
            return hasShortcut ? (
              <Tooltip title={tooltipContent} arrow key={idx}>
                {btn}
              </Tooltip>
            ) : (
              btn
            );
          })}
        </Box>
      ))}
    </Box>
  );
};

export default KeyboardGrid;
