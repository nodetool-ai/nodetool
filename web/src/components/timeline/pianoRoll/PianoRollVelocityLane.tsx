/** @jsxImportSource @emotion/react */
/**
 * The velocity lane under the note grid: one bar per note, at the note's own x.
 *
 * Dragging a bar writes that note's velocity, so how hard a note is struck is
 * edited where it is seen rather than through a number field in the inspector.
 * The whole drag is one undo entry — the parent opens and closes the history
 * batch around it, the way a clip drag does.
 */

import React, { memo, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useColorScheme, useTheme } from "@mui/material/styles";

import type { MidiNote } from "@nodetool-ai/timeline";

import { velocityColor } from "@nodetool-ai/timeline";

import {
  NEUTRAL_NOTE_RGB,
  parseCssColor,
  pickPianoRollColors,
  rgbCss,
  type Rgb
} from "./pianoRollColors";
import { noteRect, type PianoRollGeometry } from "./pianoRollGeometry";

/** Height of the velocity lane. */
export const VELOCITY_LANE_HEIGHT_PX = 96;
/** The velocities the document stores. */
const MAX_VELOCITY = 127;
const MIN_VELOCITY = 1;
/** A bar this wide is still grabbable when its note is a hairline. */
const MIN_BAR_WIDTH_PX = 8;
/** A stem's thickness and its round head's radius. */
const STEM_WIDTH_PX = 2;
const HEAD_RADIUS_PX = 3.5;
/** A muted note's stem fades to this opacity. */
const MUTED_ALPHA = 0.35;
/** Width of the ring around a selected note's head. */
const SELECTED_RING_PX = 1.5;

const canvasStyles = css({
  display: "block",
  width: "100%",
  cursor: "ns-resize",
  touchAction: "none"
});

/** The velocity a pointer at `y` in a `height`-tall lane means. */
export function velocityAtY(y: number, height: number): number {
  if (height <= 0) return MAX_VELOCITY;
  const ratio = 1 - y / height;
  return Math.min(
    MAX_VELOCITY,
    Math.max(MIN_VELOCITY, Math.round(ratio * MAX_VELOCITY))
  );
}

interface PianoRollVelocityLaneProps {
  /** Lane height in px. */
  heightPx: number;
  notes: ReadonlyArray<MidiNote>;
  selectedIds: ReadonlySet<string>;
  geometry: PianoRollGeometry;
  widthPx: number;
  /** `velocity` colors a stem by its velocity, `clip` by the clip color, as the grid does. */
  noteColorMode?: "velocity" | "clip";
  clipColor?: string;
  onGestureStart: () => void;
  onVelocityChange: (noteId: string, velocity: number) => void;
  onGestureEnd: () => void;
}

export const PianoRollVelocityLane: React.FC<PianoRollVelocityLaneProps> = memo(
  ({
    heightPx,
    notes,
    selectedIds,
    geometry,
    widthPx,
    noteColorMode = "velocity",
    clipColor,
    onGestureStart,
    onVelocityChange,
    onGestureEnd
  }) => {
    const theme = useTheme();
    const { t } = useTranslation();
    const { mode, systemMode } = useColorScheme();
    const activeMode = (mode === "system" ? systemMode : mode) ?? "dark";
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const draggingIdRef = useRef<string | null>(null);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || widthPx <= 0) return;
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
      ctx.fillStyle = colors.whiteRow;
      ctx.fillRect(0, 0, widthPx, heightPx);

      // Faint guides at 25, 50 and 75 percent.
      ctx.strokeStyle = colors.gridLine;
      ctx.beginPath();
      for (const ratio of [0.25, 0.5, 0.75]) {
        const y = Math.round(heightPx * ratio) + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(widthPx, y);
      }
      ctx.stroke();

      const clipRgb: Rgb = parseCssColor(clipColor) ?? parseCssColor(colors.note) ?? NEUTRAL_NOTE_RGB;
      const usable = heightPx - HEAD_RADIUS_PX * 2;
      for (const note of notes) {
        const rect = noteRect(note, geometry);
        if (rect.x > widthPx || rect.x + rect.width < 0) continue;
        const selected = selectedIds.has(note.id);
        const color = rgbCss(noteColorMode === "clip" ? clipRgb : (velocityColor(note.velocity) as Rgb));
        const cx = rect.x + HEAD_RADIUS_PX;
        const headY = HEAD_RADIUS_PX + usable * (1 - note.velocity / MAX_VELOCITY);
        ctx.globalAlpha = note.muted ? MUTED_ALPHA : 1;
        ctx.fillStyle = color;
        ctx.fillRect(cx - STEM_WIDTH_PX / 2, headY, STEM_WIDTH_PX, heightPx - headY);
        ctx.beginPath();
        ctx.arc(cx, headY, HEAD_RADIUS_PX, 0, Math.PI * 2);
        ctx.fill();
        if (selected) {
          ctx.strokeStyle = colors.noteSelected;
          ctx.lineWidth = SELECTED_RING_PX;
          ctx.stroke();
          ctx.lineWidth = 1;
        }
        ctx.globalAlpha = 1;
      }
    }, [theme, activeMode, notes, selectedIds, geometry, widthPx, noteColorMode, clipColor, heightPx]);

    /** The note whose bar is under `x`; the last one wins where bars overlap. */
    const noteAtX = useCallback(
      (x: number): MidiNote | null => {
        for (let i = notes.length - 1; i >= 0; i--) {
          const note = notes[i]!;
          const rect = noteRect(note, geometry);
          const width = MIN_BAR_WIDTH_PX;
          if (x >= rect.x && x < rect.x + width) return note;
        }
        return null;
      },
      [geometry, notes]
    );

    const handlePointerDown = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (e.button !== 0) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const note = noteAtX(e.clientX - rect.left);
        if (!note) return;
        draggingIdRef.current = note.id;
        onGestureStart();
        onVelocityChange(
          note.id,
          velocityAtY(e.clientY - rect.top, heightPx)
        );
        if (typeof e.currentTarget.setPointerCapture === "function") {
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // No capture: the drag still works while the pointer stays inside.
          }
        }
      },
      [noteAtX, onGestureStart, onVelocityChange, heightPx]
    );

    const handlePointerMove = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        const id = draggingIdRef.current;
        if (id === null) return;
        const rect = e.currentTarget.getBoundingClientRect();
        onVelocityChange(
          id,
          velocityAtY(e.clientY - rect.top, heightPx)
        );
      },
      [onVelocityChange, heightPx]
    );

    const handlePointerUp = useCallback(() => {
      if (draggingIdRef.current === null) return;
      draggingIdRef.current = null;
      onGestureEnd();
    }, [onGestureEnd]);

    return (
      <canvas
        ref={canvasRef}
        css={canvasStyles}
        style={{ height: heightPx }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        aria-label={t("pass3_21.timeline.pianoRoll.velocityLane.noteVelocities")}
        role="img"
      />
    );
  }
);

PianoRollVelocityLane.displayName = "PianoRollVelocityLane";
