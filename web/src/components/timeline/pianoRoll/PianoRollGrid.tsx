/** @jsxImportSource @emotion/react */
/**
 * The note grid canvas — rows, grid lines, the clip's window, the notes, and
 * the marquee.
 *
 * Drawing only: the pointer gestures live in `PianoRoll`, which owns the note
 * list and the undo batch. Keeping the two apart is what lets the hit test in
 * `pianoRollGeometry` be the single answer to "what is under the pointer" for
 * both.
 */

import React, { memo, useEffect, useRef } from "react";
import { css } from "@emotion/react";
import { useColorScheme, useTheme } from "@mui/material/styles";

import type { MidiNote, NoteRect } from "@nodetool-ai/timeline";

import { BORDER_RADIUS, TYPOGRAPHY } from "../../ui_primitives";
import { pickPianoRollColors } from "./pianoRollColors";
import {
  isBlackKey,
  noteRect,
  pitchToY,
  pitchName,
  tickToX,
  type PianoRollGeometry
} from "./pianoRollGeometry";

/** How round a note bar's corners are, in px. */

/** The quietest note still draws at this opacity. */
const MIN_NOTE_ALPHA = 0.45;

const canvasStyles = css({
  ...TYPOGRAPHY.mono.caption,
  borderRadius: BORDER_RADIUS.xs,
  position: "absolute",
  inset: 0,
  display: "block",
  width: "100%",
  height: "100%"
});

interface PianoRollGridProps {
  geometry: PianoRollGeometry;
  widthPx: number;
  heightPx: number;
  notes: ReadonlyArray<MidiNote>;
  selectedIds: ReadonlySet<string>;
  /** Content ticks a subdivision line sits on. */
  gridTicks: readonly number[];
  /** Content ticks a bar line sits on. */
  barTicks: readonly number[];
  /** The clip's window, in content ticks. Notes outside it are never heard. */
  windowFromTick: number;
  windowToTick: number;
  /** The in-progress marquee, in content ticks and pitches. */
  marquee: NoteRect | null;
}

export const PianoRollGrid: React.FC<PianoRollGridProps> = memo(
  ({
    geometry,
    widthPx,
    heightPx,
    notes,
    selectedIds,
    gridTicks,
    barTicks,
    windowFromTick,
    windowToTick,
    marquee
  }) => {
    const theme = useTheme();
    const { mode, systemMode } = useColorScheme();
    const activeMode = (mode === "system" ? systemMode : mode) ?? "dark";
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || widthPx <= 0 || heightPx <= 0) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const colors = pickPianoRollColors(
        theme,
        activeMode === "light" ? "light" : "dark"
      );
      const dpr =
        typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      canvas.width = widthPx * dpr;
      canvas.height = heightPx * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const canvasStyle = getComputedStyle(canvas);
      const noteRadius = parseFloat(canvasStyle.borderRadius) || 0;
      ctx.font = `${canvasStyle.fontSize} ${canvasStyle.fontFamily}`;

      // Rows.
      ctx.fillStyle = colors.whiteRow;
      ctx.fillRect(0, 0, widthPx, heightPx);
      const rows = Math.ceil(heightPx / geometry.rowHeightPx) + 1;
      for (let row = 0; row < rows; row++) {
        const pitch = geometry.topPitch - row;
        if (pitch < 0 || pitch > 127) continue;
        if (!isBlackKey(pitch)) continue;
        ctx.fillStyle = colors.blackRow;
        ctx.fillRect(0, pitchToY(pitch, geometry), widthPx, geometry.rowHeightPx);
      }

      // Grid lines, then the stronger bar lines over them.
      ctx.strokeStyle = colors.gridLine;
      ctx.beginPath();
      for (const tick of gridTicks) {
        const x = Math.round(tickToX(tick, geometry)) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, heightPx);
      }
      ctx.stroke();
      ctx.strokeStyle = colors.barLine;
      ctx.beginPath();
      for (const tick of barTicks) {
        const x = Math.round(tickToX(tick, geometry)) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, heightPx);
      }
      ctx.stroke();

      // Everything outside the clip's window is stored but never played, so it
      // is shaded rather than hidden: a trim hides notes, it does not delete
      // them, and the panel has to show what a longer window would bring back.
      ctx.fillStyle = colors.outsideWindow;
      const windowStartX = tickToX(windowFromTick, geometry);
      const windowEndX = tickToX(windowToTick, geometry);
      if (windowStartX > 0) ctx.fillRect(0, 0, windowStartX, heightPx);
      if (windowEndX < widthPx) {
        ctx.fillRect(windowEndX, 0, widthPx - windowEndX, heightPx);
      }

      // Notes.
      for (const note of notes) {
        const rect = noteRect(note, geometry);
        if (rect.x > widthPx || rect.x + rect.width < 0) continue;
        if (rect.y > heightPx || rect.y + rect.height < 0) continue;
        const selected = selectedIds.has(note.id);
        ctx.globalAlpha =
          MIN_NOTE_ALPHA + (note.velocity / 127) * (1 - MIN_NOTE_ALPHA);
        ctx.fillStyle = colors.note;
        ctx.beginPath();
        ctx.roundRect(
          rect.x,
          rect.y + 1,
          Math.max(2, rect.width - 1),
          Math.max(1, rect.height - 2),
          noteRadius
        );
        ctx.fill();
        ctx.globalAlpha = 1;
        if (rect.width > 44 && rect.height >= 16) {
          ctx.fillStyle = colors.noteSelected;
          ctx.fillText(pitchName(note.pitch), rect.x + 4, rect.y + rect.height - 4);
        }
        if (selected) {
          ctx.strokeStyle = colors.noteSelected;
          ctx.stroke();
        }
      }

      // Marquee.
      if (marquee) {
        const x0 = tickToX(Math.min(marquee.fromTick, marquee.toTick), geometry);
        const x1 = tickToX(Math.max(marquee.fromTick, marquee.toTick), geometry);
        const highPitch = Math.max(marquee.minPitch, marquee.maxPitch);
        const lowPitch = Math.min(marquee.minPitch, marquee.maxPitch);
        const y0 = pitchToY(highPitch, geometry);
        const y1 = pitchToY(lowPitch, geometry) + geometry.rowHeightPx;
        ctx.fillStyle = colors.marquee;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        ctx.strokeStyle = colors.noteSelected;
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
      }
    }, [
      theme,
      activeMode,
      geometry,
      widthPx,
      heightPx,
      notes,
      selectedIds,
      gridTicks,
      barTicks,
      windowFromTick,
      windowToTick,
      marquee
    ]);

    return <canvas ref={canvasRef} css={canvasStyles} aria-hidden />;
  }
);

PianoRollGrid.displayName = "PianoRollGrid";
