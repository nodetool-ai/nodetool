/** @jsxImportSource @emotion/react */
/**
 * TimelineShortcutsDialog — a reference sheet for every timeline keyboard
 * shortcut, grouped by task. Opened with `?` (or the toolbar help button) and
 * closed with Escape / the close button.
 *
 * The shortcut set is authored here to match the window-level handler in
 * TracksRegion; keep the two in sync when adding a shortcut.
 */
import React, { memo } from "react";
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
  SPACING,
  getSpacingPx
} from "../ui_primitives";

interface Shortcut {
  keys: string[];
  action: string;
  /** Alternate binding shown after the primary one (e.g. "or Backspace"). */
  alt?: string[];
}

interface ShortcutGroup {
  title: string;
  shortcuts: Shortcut[];
}

/**
 * Mirrors the bindings registered in TracksRegion's window keydown handler.
 * `Ctrl` renders as `⌘` on macOS via ShortcutHint's key formatting when the
 * author uses "Cmd"; here we use "Ctrl" to match the handler's `ctrlKey ||
 * metaKey` check, which accepts either.
 */
const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Tools",
    shortcuts: [
      { keys: ["V"], action: "Select tool" },
      { keys: ["C"], action: "Cut (blade) tool" },
      { keys: ["Esc"], action: "Clear selection · back to Select" }
    ]
  },
  {
    title: "Editing",
    shortcuts: [
      { keys: ["S"], action: "Split selected clips at playhead" },
      { keys: ["Delete"], action: "Delete selected clips", alt: ["Backspace"] },
      { keys: ["Ctrl", "D"], action: "Duplicate (after each source)" },
      { keys: ["Ctrl", "Shift", "D"], action: "Duplicate with a 1 s gap" },
      { keys: ["Ctrl", "A"], action: "Select all clips" }
    ]
  },
  {
    title: "Clipboard",
    shortcuts: [
      { keys: ["Ctrl", "C"], action: "Copy selected clips" },
      { keys: ["Ctrl", "X"], action: "Cut selected clips" },
      { keys: ["Ctrl", "V"], action: "Paste at playhead" }
    ]
  },
  {
    title: "Move",
    shortcuts: [
      { keys: ["←"], action: "Nudge left one frame", alt: ["→"] },
      { keys: ["Shift", "←"], action: "Nudge one second", alt: ["Shift", "→"] }
    ]
  },
  {
    title: "Zoom & view",
    shortcuts: [
      { keys: ["+"], action: "Zoom in", alt: ["="] },
      { keys: ["-"], action: "Zoom out", alt: ["_"] },
      { keys: ["Shift", "Z"], action: "Zoom to fit content" }
    ]
  },
  {
    title: "History",
    shortcuts: [
      { keys: ["Ctrl", "Z"], action: "Undo" },
      { keys: ["Ctrl", "Shift", "Z"], action: "Redo", alt: ["Ctrl", "Y"] }
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

const ShortcutRow: React.FC<{ shortcut: Shortcut }> = ({ shortcut }) => {
  const theme = useTheme();
  return (
    <div css={rowStyles(theme)}>
      <Text size="small" sx={{ minWidth: 0 }}>
        {shortcut.action}
      </Text>
      <div css={keysCellStyles}>
        <ShortcutHint shortcut={shortcut.keys} />
        {shortcut.alt ? (
          <>
            <Caption sx={{ opacity: 0.6 }}>or</Caption>
            <ShortcutHint shortcut={shortcut.alt} />
          </>
        ) : null}
      </div>
    </div>
  );
};

export interface TimelineShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Two-column masonry of grouped shortcut rows inside a standard Dialog. */
export const TimelineShortcutsDialog: React.FC<TimelineShortcutsDialogProps> =
  memo(({ open, onClose }) => {
    const theme = useTheme();
    return (
      <Dialog
        open={open}
        onClose={onClose}
        title="Keyboard shortcuts"
        minWidth="min(680px, 100vw - 32px)"
      >
        <div
          css={css({
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: getSpacingPx(SPACING.xl),
            paddingTop: getSpacingPx(SPACING.sm),
            "@media (max-width: 560px)": { gridTemplateColumns: "1fr" }
          })}
        >
          {SHORTCUT_GROUPS.map((group) => (
            <FlexColumn key={group.title} gap={0.5} css={groupStyles}>
              <Caption sx={groupTitleSx}>{group.title}</Caption>
              {group.shortcuts.map((shortcut) => (
                <ShortcutRow key={shortcut.action} shortcut={shortcut} />
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
          <Caption sx={{ opacity: 0.7 }}>any time to toggle this panel</Caption>
        </FlexRow>
      </Dialog>
    );
  });

TimelineShortcutsDialog.displayName = "TimelineShortcutsDialog";

export default TimelineShortcutsDialog;
