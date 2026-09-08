/** @jsxImportSource @emotion/react */
/**
 * The clip-editor panel: a resizable strip under the tracks holding the piano
 * roll for one midi clip.
 *
 * It is the DAW clip view — the side dock is 360 px wide and a piano roll
 * needs the full width of the editor, so the panel stacks below the tracks and
 * takes its height from a drag divider of its own, the same pointer + keyboard
 * control the tracks panel uses.
 *
 * On a phone there is no room to stack: the panel replaces the tracks region
 * outright and its header carries a Back control instead of a Close.
 */

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import {
  useTimelineUIStore,
  MAX_PIANO_ROLL_HEIGHT_PX,
  MIN_PIANO_ROLL_HEIGHT_PX
} from "../../../stores/timeline/TimelineUIStore";
import { findClipById } from "../../../stores/timeline/clipLookup";
import {
  Caption,
  SelectField,
  EditorButton,
  CloseButton,
  FlexColumn,
  FlexRow,
  MOTION,
  SPACING,
  ToolbarIconButton,
  TruncatedText
} from "../../ui_primitives";
import type { TempoGridDivision } from "@nodetool-ai/timeline";
import { GRID_DIVISION_OPTIONS } from "../Tracks/tempoGrid";
import { PianoRoll } from "./PianoRoll";

const HANDLE_HEIGHT_PX = 6;
const TOUCH_HANDLE_HEIGHT_PX = 20;
/** Arrow-key step for keyboard resizing. */
const KEYBOARD_RESIZE_STEP_PX = 20;

const dragHandleStyles = (theme: Theme) =>
  css({
    height: HANDLE_HEIGHT_PX,
    cursor: "ns-resize",
    flexShrink: 0,
    backgroundColor: theme.vars.palette.divider,
    transition: MOTION.background,
    outline: "none",
    touchAction: "none",
    "&:hover, &.dragging": {
      backgroundColor: theme.vars.palette.primary.main
    },
    "&:focus-visible": {
      backgroundColor: theme.vars.palette.primary.main,
      boxShadow: `0 0 0 2px ${theme.vars.palette.primary.main}`
    }
  });

const panelStyles = (theme: Theme) =>
  css({
    flexShrink: 0,
    minHeight: 0,
    overflow: "hidden",
    backgroundColor: theme.vars.palette.background.default
  });

const headerStyles = (theme: Theme) =>
  css({
    flexShrink: 0,
    minHeight: 36,
    flexWrap: "wrap",
    borderBottom: `1px solid ${theme.vars.palette.divider}`
  });

interface PianoRollPanelProps {
  /** Phone layout: the panel takes the tracks region's place, full height. */
  fullHeight?: boolean;
}

export const PianoRollPanel: React.FC<PianoRollPanelProps> = memo(
  ({ fullHeight = false }) => {
    const theme = useTheme();
    const clipId = useTimelineUIStore((s) => s.pianoRollClipId);
    const heightPx = useTimelineUIStore((s) => s.pianoRollHeightPx);
    const setHeightPx = useTimelineUIStore((s) => s.setPianoRollHeightPx);
    const closePianoRoll = useTimelineUIStore((s) => s.closePianoRoll);
    const setGridDivision = useTimelineUIStore((s) => s.setGridDivision);
    const snapEnabled = useTimelineUIStore((s) => s.snapEnabled);
    const toggleSnap = useTimelineUIStore((s) => s.toggleSnap);
    const gridDivision = useTimelineUIStore((s) => s.gridDivision);

    // A clip the panel is open on can be deleted, or the whole document
    // replaced by an external sync — either way the panel has nothing left to
    // edit and closes itself rather than showing an empty grid.
    const clip = useTimelineStore((s) =>
      clipId ? findClipById(s.clips, clipId) : undefined
    );
    const isEditable = clip !== undefined && clip.mediaType === "midi";
    useEffect(() => {
      if (clipId !== null && !isEditable) closePianoRoll();
    }, [clipId, isEditable, closePianoRoll]);

    const [isDragging, setIsDragging] = useState(false);
    const dragStartYRef = useRef(0);
    const dragStartHeightRef = useRef(heightPx);
    const handleRef = useRef<HTMLDivElement>(null);

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        dragStartYRef.current = e.clientY;
        dragStartHeightRef.current = heightPx;
        setIsDragging(true);
      },
      [heightPx]
    );

    useEffect(() => {
      if (!isDragging) return;
      document.body.style.userSelect = "none";
      const handleEl = handleRef.current;
      handleEl?.classList.add("dragging");
      const onPointerMove = (ev: PointerEvent) => {
        // Drag up → taller, the way the tracks divider works.
        setHeightPx(dragStartHeightRef.current + (dragStartYRef.current - ev.clientY));
      };
      const onPointerUp = () => setIsDragging(false);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
      return () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
        document.body.style.userSelect = "";
        handleEl?.classList.remove("dragging");
      };
    }, [isDragging, setHeightPx]);

    const handleHandleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setHeightPx(heightPx + KEYBOARD_RESIZE_STEP_PX);
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          setHeightPx(heightPx - KEYBOARD_RESIZE_STEP_PX);
        }
      },
      [heightPx, setHeightPx]
    );

    if (clipId === null || !isEditable) return null;

    return (
      <>
        {!fullHeight && (
          <div
            ref={handleRef}
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize note editor"
            aria-valuenow={heightPx}
            aria-valuemin={MIN_PIANO_ROLL_HEIGHT_PX}
            aria-valuemax={MAX_PIANO_ROLL_HEIGHT_PX}
            tabIndex={0}
            css={dragHandleStyles(theme)}
            onPointerDown={handlePointerDown}
            onKeyDown={handleHandleKeyDown}
          />
        )}
        <FlexColumn
          fullWidth
          css={panelStyles(theme)}
          data-testid="piano-roll-panel"
          sx={
            fullHeight
              ? { flex: "1 1 0", minHeight: 0 }
              : { height: heightPx }
          }
        >
          <FlexRow
            fullWidth
            align="center"
            gap={SPACING.sm}
            css={headerStyles(theme)}
            sx={{ px: SPACING.sm }}
          >
            {fullHeight && (
              <ToolbarIconButton
                onClick={closePianoRoll}
                tooltip="Back to tracks"
                aria-label="Back to tracks"
              >
                <ArrowBackIosNewIcon fontSize="small" />
              </ToolbarIconButton>
            )}
            <TruncatedText maxWidth={220}>
              {clip.name || "Midi clip"}
            </TruncatedText>
            <Caption color="muted">
              {clip.notes?.length ?? 0} {(clip.notes?.length ?? 0) === 1 ? "note" : "notes"}
            </Caption>
            <SelectField label="Note grid" hideLabel size="small" value={gridDivision}
              options={GRID_DIVISION_OPTIONS} css={css({ width: 96 })}
              onChange={(value) => setGridDivision(value as TempoGridDivision)} />
            <EditorButton variant={snapEnabled ? "contained" : "text"} onClick={toggleSnap} aria-label="Snap notes" aria-pressed={snapEnabled}>Snap</EditorButton>
            <FlexRow sx={{ flex: 1 }} />
            {!fullHeight && (
              <CloseButton
                onClick={closePianoRoll}
                tooltip="Close note editor"
              />
            )}
          </FlexRow>
          <PianoRoll clipId={clipId} onClose={closePianoRoll} />
        </FlexColumn>
      </>
    );
  }
);

PianoRollPanel.displayName = "PianoRollPanel";
