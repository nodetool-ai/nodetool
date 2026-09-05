/** @jsxImportSource @emotion/react */
/**
 * TimelineShortcutsDialog — a reference sheet for every timeline keyboard
 * shortcut, grouped by task, with the keyboard-layout switch at the top.
 * Opened with `?` (or the toolbar help button) and closed with Escape / the
 * close button.
 *
 * The keys come from `timelineKeymap.ts`, the same table the window handler
 * in TracksRegion resolves against, so the sheet cannot drift from what the
 * keys do. The labels here are the only copy.
 */
import React, { memo, useCallback } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import {
  Dialog,
  FlexColumn,
  FlexRow,
  ShortcutHint,
  Text,
  Caption,
  ToggleGroup,
  ToggleOption,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import { useSettingsStore } from "../../stores/SettingsStore";
import {
  bindingKeys,
  TIMELINE_KEYBOARD_PRESET_LABELS,
  TIMELINE_KEYBOARD_PRESETS,
  TIMELINE_KEYMAPS,
  type TimelineAction,
  type TimelineKeyboardPreset
} from "./timelineKeymap";

interface Row {
  /** The action whose bindings fill the key column, or fixed keys for a
   *  pointer gesture that has no keyboard binding. */
  action?: TimelineAction;
  keys?: string[];
  label: string;
}

interface Group {
  title: string;
  rows: Row[];
}

const GROUPS: Group[] = [
  {
    title: "Tools",
    rows: [
      { action: "selectTool", label: "Select tool" },
      { action: "cutTool", label: "Cut (blade) tool" },
      { action: "toggleSnap", label: "Toggle snapping" },
      { action: "escape", label: "Clear selection · back to Select" }
    ]
  },
  {
    title: "Editing",
    rows: [
      { action: "splitAtPlayhead", label: "Split selected clips at playhead" },
      { action: "cutAllTracks", label: "Cut all tracks at playhead" },
      { action: "deleteSelected", label: "Delete selected clips" },
      { action: "rippleDeleteSelected", label: "Ripple delete (close the gap)" },
      { keys: ["Ctrl", "drag edge"], label: "Roll the cut with its neighbour" },
      { keys: ["click edge"], label: "Select the edit point" },
      { action: "extendEdit", label: "Extend the edit point to the playhead" },
      { action: "trimEditLeft", label: "Trim edit point one frame back" },
      { action: "trimEditRight", label: "Trim edit point one frame on" },
      { action: "trimEditLeftLarge", label: "Trim edit point ten frames back" },
      { action: "trimEditRightLarge", label: "Trim edit point ten frames on" },
      { action: "duplicate", label: "Duplicate (after each source)" },
      { action: "duplicateWithGap", label: "Duplicate with a 1 s gap" },
      { action: "applyDefaultTransition", label: "Cross-fade into selected clips" },
      { action: "selectAll", label: "Select all clips" }
    ]
  },
  {
    title: "Clipboard",
    rows: [
      { action: "copy", label: "Copy selected clips" },
      { action: "cut", label: "Cut selected clips" },
      { action: "paste", label: "Paste at playhead" }
    ]
  },
  {
    title: "Move",
    rows: [
      { action: "nudgeLeft", label: "Nudge one frame back" },
      { action: "nudgeRight", label: "Nudge one frame on" },
      { action: "nudgeLeftLarge", label: "Nudge one second back" },
      { action: "nudgeRightLarge", label: "Nudge one second on" },
      { keys: ["Alt", "drag"], label: "Disable snapping while moving or trimming" },
      { keys: ["Ctrl", "drag clip"], label: "Insert on drop (push later clips right)" }
    ]
  },
  {
    title: "Playback",
    rows: [
      { keys: ["Space"], label: "Play / pause" },
      { action: "shuttleBack", label: "Shuttle backwards (again: faster)" },
      { action: "shuttleStop", label: "Stop shuttle" },
      { action: "shuttleForward", label: "Shuttle forwards (again: faster)" },
      { action: "markIn", label: "Mark in" },
      { action: "markOut", label: "Mark out" },
      { action: "clearRange", label: "Clear in and out" },
      { action: "prevCut", label: "Previous cut" },
      { action: "nextCut", label: "Next cut" },
      { action: "addMarker", label: "Add marker at playhead" },
      { action: "nextMarker", label: "Next marker" },
      { action: "prevMarker", label: "Previous marker" }
    ]
  },
  {
    title: "Keyframes & source",
    rows: [
      { action: "addKeyframe", label: "Keyframe the selected clip at the playhead" },
      { action: "nextKeyframe", label: "Next keyframe" },
      { action: "prevKeyframe", label: "Previous keyframe" },
      { action: "sourceAppend", label: "Append source range to the end" },
      { action: "sourceInsert", label: "Insert source range at playhead" },
      { action: "sourceOverwrite", label: "Overwrite with source range at playhead" }
    ]
  },
  {
    title: "Zoom & view",
    rows: [
      { action: "zoomIn", label: "Zoom in" },
      { action: "zoomOut", label: "Zoom out" },
      { action: "zoomFit", label: "Zoom to fit content" }
    ]
  },
  {
    title: "History",
    rows: [
      { action: "undo", label: "Undo" },
      { action: "redo", label: "Redo" }
    ]
  }
];

const groupStyles = css({
  minWidth: 0
});

const rowStyles = (theme: Theme) =>
  css({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: getSpacingPx(SPACING.lg),
    padding: `${getSpacingPx(SPACING.xs)} 0`,
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    "&:last-of-type": { borderBottom: "none" }
  });

const groupTitleSx = {
  color: "text.secondary",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontWeight: 600
} as const;

const keysCellStyles = css({
  display: "flex",
  alignItems: "center",
  gap: getSpacingPx(SPACING.xs),
  flexShrink: 0
});

const ShortcutRow: React.FC<{ row: Row; preset: TimelineKeyboardPreset }> = ({
  row,
  preset
}) => {
  const theme = useTheme();
  const combos: string[][] = row.action
    ? TIMELINE_KEYMAPS[preset][row.action].map(bindingKeys)
    : row.keys
      ? [row.keys]
      : [];
  return (
    <div css={rowStyles(theme)}>
      <Text size="small" sx={{ minWidth: 0 }}>
        {row.label}
      </Text>
      <div css={keysCellStyles}>
        {combos.map((keys, i) => (
          <React.Fragment key={keys.join("+")}>
            {i > 0 && <Caption sx={{ opacity: 0.6 }}>or</Caption>}
            <ShortcutHint shortcut={keys} />
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

interface TimelineShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Two-column masonry of grouped shortcut rows inside a standard Dialog. */
export const TimelineShortcutsDialog: React.FC<TimelineShortcutsDialogProps> =
  memo(({ open, onClose }) => {
    const theme = useTheme();
    const preset = useSettingsStore(
      (s) => s.settings.timelineKeyboardPreset
    );
    const updateSettings = useSettingsStore((s) => s.updateSettings);
    const handlePreset = useCallback(
      (_e: React.MouseEvent<HTMLElement>, value: string | null) => {
        if (value && (TIMELINE_KEYBOARD_PRESETS as readonly string[]).includes(value)) {
          updateSettings({
            timelineKeyboardPreset: value as TimelineKeyboardPreset
          });
        }
      },
      [updateSettings]
    );
    return (
      <Dialog
        open={open}
        onClose={onClose}
        title="Keyboard shortcuts"
        minWidth="min(680px, 100vw - 32px)"
      >
        <FlexRow align="center" gap={1} sx={{ pb: 1 }}>
          <Caption sx={groupTitleSx}>Layout</Caption>
          <ToggleGroup
            value={preset}
            exclusive
            onChange={handlePreset}
            compact
            aria-label="Keyboard layout"
          >
            {TIMELINE_KEYBOARD_PRESETS.map((p) => (
              <ToggleOption key={p} value={p}>
                {TIMELINE_KEYBOARD_PRESET_LABELS[p]}
              </ToggleOption>
            ))}
          </ToggleGroup>
        </FlexRow>
        <div
          css={css({
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: getSpacingPx(SPACING.xl),
            paddingTop: getSpacingPx(SPACING.sm),
            "@media (max-width: 560px)": { gridTemplateColumns: "1fr" }
          })}
        >
          {GROUPS.map((group) => (
            <FlexColumn key={group.title} gap={0.5} css={groupStyles}>
              <Caption sx={groupTitleSx}>{group.title}</Caption>
              {group.rows.map((row) => (
                <ShortcutRow key={row.label} row={row} preset={preset} />
              ))}
            </FlexColumn>
          ))}
        </div>
        <FlexRow
          justify="center"
          align="center"
          gap={0.5}
          sx={{ pt: 2, mt: 1, borderTop: `1px solid ${theme.vars.palette.divider}` }}
        >
          <Caption sx={{ opacity: 0.7 }}>Press</Caption>
          <ShortcutHint shortcut={["?"]} />
          <Caption sx={{ opacity: 0.7 }}>
            any time to toggle this panel · Ctrl also responds to ⌘ on macOS
          </Caption>
        </FlexRow>
      </Dialog>
    );
  });

TimelineShortcutsDialog.displayName = "TimelineShortcutsDialog";

export default TimelineShortcutsDialog;
