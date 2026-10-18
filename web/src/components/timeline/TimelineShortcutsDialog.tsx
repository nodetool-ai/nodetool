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
  TYPOGRAPHY,
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

export interface Row {
  /** The action whose bindings fill the key column, or fixed keys for a
   *  pointer gesture that has no keyboard binding. */
  action?: TimelineAction;
  keys?: string[];
  label: string;
}

export interface Group {
  title: string;
  rows: Row[];
}

export const TIMELINE_SHORTCUT_GROUPS: readonly Group[] = [
  {
    title: "Tools",
    rows: [
      { action: "selectTool", label: "Select tool" },
      { action: "trackSelectTool", label: "Track select tool (every clip from the click on)" },
      { action: "trackSelectBackwardTool", label: "Track select backward tool (every clip up to the click)" },
      { action: "rippleTool", label: "Ripple edit tool" },
      { action: "rollTool", label: "Rolling edit tool" },
      { action: "rateStretchTool", label: "Rate stretch tool" },
      { action: "cutTool", label: "Cut (blade) tool" },
      { action: "slipTool", label: "Slip tool" },
      { action: "slideTool", label: "Slide tool (neighbours trim to follow)" },
      { action: "handTool", label: "Hand tool (drag to scroll)" },
      { action: "zoomTool", label: "Zoom tool (click to zoom in, Alt-click out)" },
      { action: "toggleSnap", label: "Toggle snapping" },
      { action: "escape", label: "Clear selection · back to Select" }
    ]
  },
  {
    title: "Editing",
    rows: [
      { action: "splitAtPlayhead", label: "Split selected clips at playhead" },
      { action: "cutAllTracks", label: "Cut all tracks at playhead" },
      { action: "deleteSelected", label: "Delete selected clips, or close a clicked gap" },
      { action: "rippleDeleteSelected", label: "Ripple delete (close the gap)" },
      { action: "rippleTrimPrevToPlayhead", label: "Ripple trim the previous edit to the playhead" },
      { action: "rippleTrimNextToPlayhead", label: "Ripple trim the next edit to the playhead" },
      { action: "liftRange", label: "Lift the in to out range (leave the gap)" },
      { action: "extractRange", label: "Extract the in to out range (close the gap)" },
      { keys: ["Ctrl", "drag edge"], label: "Roll the cut with its neighbour" },
      { keys: ["click edge"], label: "Select the edit point" },
      { action: "extendEdit", label: "Extend the edit point to the playhead" },
      { action: "trimEditLeft", label: "Trim edit point one frame back" },
      { action: "trimEditRight", label: "Trim edit point one frame on" },
      { action: "trimEditLeftLarge", label: "Trim edit point ten frames back" },
      { action: "trimEditRightLarge", label: "Trim edit point ten frames on" },
      { action: "duplicate", label: "Duplicate after the selection" },
      { action: "duplicateWithGap", label: "Duplicate with a 1 s gap" },
      { action: "applyDefaultTransition", label: "Cross-fade into selected clips" },
      { action: "applyFades", label: "Fade selected clips in and out" },
      { action: "applyDefaultAudioTransition", label: "Cross-fade the audio at the selected clips' edits" },
      { action: "speedDuration", label: "Speed and duration of selected clips" },
      { action: "audioGain", label: "Audio gain of selected clips" },
      { action: "selectAll", label: "Select all clips" },
      { action: "deselectAll", label: "Deselect all" },
      { action: "selectClipAtPlayhead", label: "Select the clips at the playhead" },
      { action: "toggleClipEnabled", label: "Enable or disable selected clips" },
      { action: "linkClips", label: "Link or unlink selected clips" },
      { action: "groupClips", label: "Group selected clips" },
      { action: "ungroupClips", label: "Ungroup selected groups" }
    ]
  },
  {
    title: "Clipboard",
    rows: [
      { action: "copy", label: "Copy selected clips" },
      { action: "cut", label: "Cut selected clips" },
      { action: "paste", label: "Paste at playhead" },
      { action: "pasteInsert", label: "Paste insert (push later clips right)" },
      { action: "pasteAttributes", label: "Paste attributes onto selected clips" }
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
      { action: "stepFrameBack", label: "Step back one frame" },
      { action: "stepFrameForward", label: "Step forward one frame" },
      { action: "stepFramesBack", label: "Step back five frames" },
      { action: "stepFramesForward", label: "Step forward five frames" },
      { action: "shuttleBack", label: "Shuttle backwards (again: faster)" },
      { action: "shuttleStop", label: "Stop shuttle" },
      { action: "shuttleForward", label: "Shuttle forwards (again: faster)" },
      { action: "markIn", label: "Mark in" },
      { action: "markOut", label: "Mark out" },
      { action: "markClip", label: "Mark the clip (in and out around it)" },
      { action: "goToIn", label: "Go to in" },
      { action: "goToOut", label: "Go to out" },
      { action: "clearRange", label: "Clear in and out" },
      { action: "prevCut", label: "Previous cut" },
      { action: "nextCut", label: "Next cut" },
      { action: "addMarker", label: "Add marker at playhead" },
      { action: "nextMarker", label: "Next marker" },
      { action: "prevMarker", label: "Previous marker" },
      { action: "toggleLoop", label: "Loop playback between in and out" },
      { action: "playInToOut", label: "Play from in to out" },
      { action: "matchFrame", label: "Match frame (open the source at this frame)" },
      { action: "revealInProject", label: "Reveal the clip's media in Assets" }
    ]
  },
  {
    // PreviewArea handles these on its own root, so they need the preview
    // focused (click it or Tab to it). Fullscreen has no key.
    title: "Preview (focused)",
    rows: [
      { keys: ["←"], label: "Step back one frame" },
      { keys: ["→"], label: "Step forward one frame" },
      { keys: ["Shift", "←"], label: "Previous clip boundary" },
      { keys: ["Shift", "→"], label: "Next clip boundary" },
      { keys: ["Home"], label: "Go to start" },
      { keys: ["End"], label: "Go to end" },
      { keys: ["Esc"], label: "Exit the expanded preview" }
    ]
  },
  {
    // TransformGizmoOverlay's own key handler, active while it has focus.
    title: "Transform handles (focused)",
    rows: [
      { keys: ["Arrows"], label: "Move the clip one pixel" },
      { keys: ["Shift", "Arrows"], label: "Move the clip ten pixels" },
      { keys: ["."], label: "Reset the transform" }
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
      { action: "zoomFit", label: "Zoom to fit content" },
      { action: "expandTracks", label: "Make tracks taller" },
      { action: "shrinkTracks", label: "Make tracks shorter" },
      { action: "toggleDawMode", label: "Switch between the video and DAW layouts" }
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

const rowSx = (theme: Theme) => ({
  py: SPACING.xs,
  borderBottom: `1px solid ${theme.vars.palette.divider}`,
  "&:last-of-type": { borderBottom: "none" }
});

const groupTitleSx = {
  ...TYPOGRAPHY.sans.label,
  color: "text.secondary"
} as const;

const ShortcutRow: React.FC<{ row: Row; preset: TimelineKeyboardPreset }> = ({
  row,
  preset
}) => {
  const combos: string[][] = row.action
    ? TIMELINE_KEYMAPS[preset][row.action].map(bindingKeys)
    : row.keys
      ? [row.keys]
      : [];
  return (
    <FlexRow
      align="center"
      justify="space-between"
      gap={SPACING.lg}
      sx={rowSx}
    >
      <Text size="small" sx={{ minWidth: 0 }}>
        {row.label}
      </Text>
      <FlexRow align="center" gap={SPACING.xs} sx={{ flexShrink: 0 }}>
        {combos.map((keys, i) => (
          <React.Fragment key={keys.join("+")}>
            {i > 0 && <Caption color="secondary">or</Caption>}
            <ShortcutHint shortcut={keys} />
          </React.Fragment>
        ))}
      </FlexRow>
    </FlexRow>
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
        maxWidth="md"
        fullWidth
      >
        <FlexRow align="center" gap={SPACING.xs} sx={{ pb: SPACING.xs }}>
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
            [theme.breakpoints.down("sm")]: { gridTemplateColumns: "1fr" }
          })}
        >
          {TIMELINE_SHORTCUT_GROUPS.map((group) => (
            <FlexColumn key={group.title} gap={SPACING.micro} css={groupStyles}>
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
          gap={SPACING.micro}
          sx={{
            pt: SPACING.md,
            mt: SPACING.xs,
            borderTop: `1px solid ${theme.vars.palette.divider}`
          }}
        >
          <Caption color="secondary">Press</Caption>
          <ShortcutHint shortcut={["?"]} />
          <Caption color="secondary">
            any time to toggle this panel · Ctrl also responds to ⌘ on macOS
          </Caption>
        </FlexRow>
      </Dialog>
    );
  });

TimelineShortcutsDialog.displayName = "TimelineShortcutsDialog";

export default TimelineShortcutsDialog;
