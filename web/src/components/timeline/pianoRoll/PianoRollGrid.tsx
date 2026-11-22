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
import { useTranslation } from "react-i18next";

import { BORDER_RADIUS, TYPOGRAPHY } from "../../ui_primitives";
import {
  NEUTRAL_NOTE_RGB,
  mixToward,
  noteDrawColors,
  readableOn,
  rgbCss,
  parseCssColor,
  pickPianoRollColors,
  type Rgb
} from "./pianoRollColors";
import { velocityColor } from "@nodetool-ai/timeline";
import {
  isBlackKey,
  noteRect,
  pitchToY,
  pitchName,
  tickToX,
  type PianoRollGeometry
} from "./pianoRollGeometry";

/** How round a note bar's corners are, in px. */

/** A note needs this much room before it shows its velocity line. */
const VELOCITY_LINE_MIN_WIDTH_PX = 8;
const VELOCITY_LINE_MIN_HEIGHT_PX = 6;
/** Padding of the velocity line inside its note, and its thickness. */
const VELOCITY_LINE_INSET_PX = 3;
const VELOCITY_LINE_THICKNESS_PX = 2;
/** Opacity of the lines at the snap step. */
const FAINT_LINE_ALPHA = 0.5;
/** Fill opacity of a harmony ghost note. */
const GHOST_NOTE_ALPHA = 0.22;

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
  /** Notes the clip plays but does not hold (its harmony expansion), drawn read-only. */
  ghostNotes?: ReadonlyArray<MidiNote>;
  selectedIds: ReadonlySet<string>;
  /** Content ticks a beat line sits on. */
  beatTicks: readonly number[];
  /** Content ticks a line at the snap step sits on. Faint. */
  stepTicks: readonly number[];
  /** `velocity` colors a note by its velocity, `clip` by the clip color. */
  noteColorMode: "velocity" | "clip";
  /** The clip color, when it is a plain color the canvas can read. */
  clipColor?: string;
  /** Content ticks a bar line sits on. */
  barTicks: readonly number[];
  /** The clip's window, in content ticks. Notes outside it are never heard. */
  windowFromTick: number;
  windowToTick: number;
  /** The in-progress marquee, in content ticks and pitches. */
  marquee: NoteRect | null;
  /** Show each note's pitch name inside it. */
  noteNames?: boolean;
  /** The note under the pointer, drawn with a hover frame. */
  hoveredId?: string | null;
}

/** Opacity of the frame on the note under the pointer. */
const HOVER_FRAME_ALPHA = 0.6;
/** Width of the line at the region start. */
const REGION_START_LINE_PX = 2;
/** A muted note's outline strength. It has no fill. */
const MUTED_NOTE_OUTLINE_ALPHA = 0.8;
/** A selected note's fill: its color mixed this far toward white. */
const SELECTED_FILL_MIX = 0.3;
/** Thickness of a selected note's frame. */
const SELECTED_FRAME_PX = 2;
/** A note needs this much room before it shows its name. */
const NOTE_NAME_MIN_WIDTH_PX = 24;
const NOTE_NAME_MIN_HEIGHT_PX = 10;
/** Gap between a note name and the velocity line after it. */
const NOTE_NAME_GAP_PX = 4;

/**
 * A thin line inside a note that has a pitch expression curve: one semitone of
 * bend moves the line one row, so a bend reads against the keyboard.
 */
function drawPitchExpression(
  ctx: CanvasRenderingContext2D,
  note: MidiNote,
  points: ReadonlyArray<{ tick: number; value: number }>,
  geometry: PianoRollGeometry,
  rect: { x: number; y: number; width: number; height: number },
  color: string
): void {
  const centreY = rect.y + rect.height / 2;
  const yAt = (value: number): number => centreY - value * geometry.rowHeightPx;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y - geometry.rowHeightPx * 2, Math.max(2, rect.width - 1), rect.height + geometry.rowHeightPx * 4);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const x0 = tickToX(note.startTick + points[0].tick, geometry);
  ctx.moveTo(rect.x, yAt(0));
  ctx.lineTo(x0, yAt(0));
  for (const p of points) {
    ctx.lineTo(tickToX(note.startTick + p.tick, geometry), yAt(p.value));
  }
  ctx.lineTo(rect.x + rect.width, yAt(points[points.length - 1].value));
  ctx.stroke();
  ctx.restore();
}

export const PianoRollGrid: React.FC<PianoRollGridProps> = memo(
  ({
    geometry,
    widthPx,
    heightPx,
    notes,
    ghostNotes,
    selectedIds,
    beatTicks,
    stepTicks,
    noteColorMode,
    clipColor,
    barTicks,
    windowFromTick,
    windowToTick,
    marquee,
    noteNames = false,
    hoveredId = null
  }) => {
    const { t } = useTranslation();
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
        const pitch = geometry.rows
          ? geometry.rows.pitches[(geometry.topRow ?? 0) + row]
          : geometry.topPitch - row;
        if (pitch === undefined || pitch < 0 || pitch > 127) continue;
        if (!isBlackKey(pitch)) continue;
        ctx.fillStyle = colors.blackRow;
        ctx.fillRect(0, pitchToY(pitch, geometry), widthPx, geometry.rowHeightPx);
      }

      // Row seams where two white keys meet (E-F and B-C), as on the
      // keyboard. The B-C seam marks the octave, so it draws at full strength.
      ctx.strokeStyle = colors.gridLine;
      for (let row = 0; row < rows; row++) {
        const pitch = geometry.rows
          ? geometry.rows.pitches[(geometry.topRow ?? 0) + row]
          : geometry.topPitch - row;
        if (pitch === undefined || pitch < 0 || pitch > 127) continue;
        const pc = pitch % 12;
        if (pc !== 0 && pc !== 5) continue;
        const y = Math.round(pitchToY(pitch, geometry) + geometry.rowHeightPx) + 0.5;
        ctx.globalAlpha = pc === 0 ? 1 : FAINT_LINE_ALPHA;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(widthPx, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Grid lines: snap steps faint, beats medium, then bars strong.
      ctx.strokeStyle = colors.gridLine;
      ctx.globalAlpha = FAINT_LINE_ALPHA;
      ctx.beginPath();
      for (const tick of stepTicks) {
        const x = Math.round(tickToX(tick, geometry)) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, heightPx);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      for (const tick of beatTicks) {
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

      // The region start, as a line in the region color.
      if (windowStartX >= 0 && windowStartX <= widthPx) {
        ctx.fillStyle = rgbCss(parseCssColor(clipColor) ?? parseCssColor(colors.note) ?? NEUTRAL_NOTE_RGB);
        ctx.fillRect(Math.round(windowStartX), 0, REGION_START_LINE_PX, heightPx);
      }

      // Harmony expansion: what the clip plays, under the notes it holds.
      if (ghostNotes) {
        ctx.fillStyle = colors.note;
        ctx.strokeStyle = colors.note;
        ctx.setLineDash([3, 2]);
        for (const note of ghostNotes) {
          const rect = noteRect(note, geometry);
          if (rect.x > widthPx || rect.x + rect.width < 0) continue;
          if (rect.y > heightPx || rect.y + rect.height < 0) continue;
          ctx.beginPath();
          ctx.roundRect(rect.x, rect.y + 1, Math.max(2, rect.width - 1), Math.max(1, rect.height - 2), noteRadius);
          ctx.globalAlpha = GHOST_NOTE_ALPHA;
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }

      // Notes.
      const clipRgb = parseCssColor(clipColor) ?? parseCssColor(colors.note) ?? NEUTRAL_NOTE_RGB;
      for (const note of notes) {
        const rect = noteRect(note, geometry);
        if (rect.x > widthPx || rect.x + rect.width < 0) continue;
        if (rect.y > heightPx || rect.y + rect.height < 0) continue;
        const selected = selectedIds.has(note.id);
        const base: Rgb = noteColorMode === "clip" ? clipRgb : velocityColor(note.velocity);
        const palette = noteDrawColors(selected ? mixToward(base, 255, SELECTED_FILL_MIX) : base);
        const bodyX = rect.x;
        const bodyY = rect.y + 1;
        const bodyW = Math.max(2, rect.width - 1);
        const bodyH = Math.max(1, rect.height - 2);
        ctx.fillStyle = palette.fill;
        ctx.strokeStyle = palette.border;
        ctx.beginPath();
        ctx.roundRect(bodyX + 0.5, bodyY + 0.5, Math.max(1, bodyW - 1), Math.max(1, bodyH - 1), noteRadius);
        if (note.muted) {
          // A muted note is drawn hollow: a frame and no fill.
          ctx.globalAlpha = MUTED_NOTE_OUTLINE_ALPHA;
          ctx.strokeStyle = palette.fill;
          ctx.stroke();
        } else {
          ctx.fill();
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        const named =
          noteNames && bodyW >= NOTE_NAME_MIN_WIDTH_PX && bodyH >= NOTE_NAME_MIN_HEIGHT_PX;
        let nameEnd = bodyX;
        if (named) {
          const name = pitchName(note.pitch);
          ctx.fillStyle = (note.muted ? colors.text : readableOn(base) === "dark"
            ? theme.colorSchemes?.light?.palette.text.primary
            : theme.colorSchemes?.dark?.palette.text.primary) ?? colors.noteSelected;
          ctx.textBaseline = "middle";
          ctx.fillText(name, bodyX + VELOCITY_LINE_INSET_PX, bodyY + bodyH / 2);
          nameEnd = bodyX + VELOCITY_LINE_INSET_PX + ctx.measureText(name).width + NOTE_NAME_GAP_PX - VELOCITY_LINE_INSET_PX;
        }
        if (
          !note.muted &&
          bodyW >= VELOCITY_LINE_MIN_WIDTH_PX &&
          bodyH >= VELOCITY_LINE_MIN_HEIGHT_PX
        ) {
          const lineY = bodyY + bodyH / 2;
          const lineStart = nameEnd + VELOCITY_LINE_INSET_PX;
          const lineEnd =
            lineStart +
            Math.round((bodyX + bodyW - VELOCITY_LINE_INSET_PX - lineStart) * (note.velocity / 127));
          ctx.fillStyle = palette.line;
          ctx.fillRect(
            lineStart,
            lineY - VELOCITY_LINE_THICKNESS_PX / 2,
            Math.max(0, lineEnd - lineStart),
            VELOCITY_LINE_THICKNESS_PX
          );
        }
        const pitchCurve = note.expression?.pitch;
        if (pitchCurve && pitchCurve.length > 0) {
          drawPitchExpression(ctx, note, pitchCurve, geometry, rect, colors.noteSelected);
        }
        if (!selected && note.id === hoveredId) {
          ctx.strokeStyle = colors.noteSelected;
          ctx.globalAlpha = HOVER_FRAME_ALPHA;
          ctx.beginPath();
          ctx.roundRect(bodyX + 0.5, bodyY + 0.5, Math.max(1, bodyW - 1), Math.max(1, bodyH - 1), noteRadius);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        if (selected) {
          ctx.strokeStyle = colors.noteSelected;
          ctx.lineWidth = SELECTED_FRAME_PX;
          ctx.beginPath();
          ctx.roundRect(bodyX + 1, bodyY + 1, Math.max(1, bodyW - 2), Math.max(1, bodyH - 2), noteRadius);
          ctx.stroke();
          ctx.lineWidth = 1;
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
      ghostNotes,
      selectedIds,
      beatTicks,
      stepTicks,
      noteColorMode,
      clipColor,
      barTicks,
      windowFromTick,
      windowToTick,
      marquee,
      noteNames,
      hoveredId
    ]);

    return <canvas ref={canvasRef} css={canvasStyles} aria-label={t("pass3_20.pianoRoll.accessibility.noteGrid")} role="img" />;
  }
);

PianoRollGrid.displayName = "PianoRollGrid";
