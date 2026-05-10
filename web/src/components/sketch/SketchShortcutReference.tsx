/**
 * Read-only list of sketch keyboard shortcuts for help dialogs.
 */

/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { Box } from "@mui/material";
import {
  ACTION_REGISTRY,
  BINDING_CATALOG,
  displayBinding,
  type BindingEntry,
  type DisplayGroup,
  type SketchActionId
} from "./shortcuts";
import { SKETCH_COLORS, SKETCH_FONT } from "./sketchStyles";
import { Text } from "../ui_primitives";

const SHORTCUT_DISPLAY_GROUPS: readonly DisplayGroup[] = [
  "Tools",
  "Edit",
  "Selection",
  "Canvas",
  "Color",
  "Paint",
  "Layers",
  "Mode: Transform",
  "Mode: Crop"
];

const PANEL_SHORTCUT_NOTES: Partial<Record<SketchActionId, string>> = {
  "blend-mode-prev": "Blend mode dropdown",
  "blend-mode-next": "Blend mode dropdown",
  "canvas-preset-prev": "Canvas preset dropdown",
  "canvas-preset-next": "Canvas preset dropdown"
};

function isUnmodifiedGlobalDigitBinding(entry: BindingEntry): boolean {
  return (
    entry.scope === "global" &&
    !entry.modifiers.ctrl &&
    !entry.modifiers.shift &&
    !entry.modifiers.alt &&
    /^\d$/.test(entry.key)
  );
}

function formatShortcutCombos(entries: ReadonlyArray<BindingEntry>): string {
  const digitEntries = entries
    .filter(isUnmodifiedGlobalDigitBinding)
    .map((entry) => Number(entry.key))
    .sort((a, b) => a - b);

  if (
    digitEntries.length === entries.length &&
    digitEntries.length > 1 &&
    digitEntries.every((digit, index) => digit === digitEntries[0]! + index)
  ) {
    return `${digitEntries[0]}–${digitEntries[digitEntries.length - 1]}`;
  }

  return [...new Set(entries.map((entry) => displayBinding(entry)))].join(
    " / "
  );
}

const SHORTCUT_REFERENCE_GROUPS = SHORTCUT_DISPLAY_GROUPS.map(
  (displayGroup) => {
    const rows = ACTION_REGISTRY.flatMap((action) => {
      if (action.displayGroup !== displayGroup) {
        return [];
      }

      const entries = BINDING_CATALOG.filter(
        (entry) => entry.actionId === action.id
      );
      if (entries.length === 0) {
        return [];
      }

      return [
        {
          actionId: action.id,
          combo: formatShortcutCombos(entries),
          label: action.label,
          note: PANEL_SHORTCUT_NOTES[action.id]
        }
      ];
    });

    return {
      displayGroup,
      rows
    };
  }
).filter((group) => group.rows.length > 0);

export const SketchShortcutReference = memo(function SketchShortcutReference() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {SHORTCUT_REFERENCE_GROUPS.map((group) => (
        <Box key={group.displayGroup}>
          <Text
            sx={{
              mb: 0.5,
              fontSize: SKETCH_FONT.xs,
              fontWeight: 700,
              color: "grey.400",
              textTransform: "uppercase",
              letterSpacing: "0.04em"
            }}
          >
            {group.displayGroup}
          </Text>
          <Box
            component="dl"
            sx={{
              fontSize: SKETCH_FONT.section,
              color: SKETCH_COLORS.textMuted,
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: "1px 6px",
              m: 0,
              "& dt": { fontWeight: 700, color: "grey.300", textAlign: "right" },
              "& dd": { m: 0 }
            }}
          >
            {group.rows.map((row) => (
              <React.Fragment key={row.actionId}>
                <Text component="dt">{row.combo}</Text>
                <Text component="dd">
                  {row.label}
                  {row.note ? ` — ${row.note}` : ""}
                </Text>
              </React.Fragment>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
});
