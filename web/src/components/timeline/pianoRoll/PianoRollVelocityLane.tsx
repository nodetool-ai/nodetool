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
import { css } from "@emotion/react";
import { useColorScheme, useTheme } from "@mui/material/styles";

import type { MidiNote } from "@nodetool-ai/timeline";

import { pickPianoRollColors } from "./pianoRollColors";
import { noteRect, type PianoRollGeometry } from "./pianoRollGeometry";

/** Height of the velocity lane. */
export const VELOCITY_LANE_HEIGHT_PX = 56;
/** The velocities the document stores. */
const MAX_VELOCITY = 127;
const MIN_VELOCITY = 1;
/** A bar this wide is still grabbable when its note is a hairline. */
const MIN_BAR_WIDTH_PX = 8;

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
  notes: ReadonlyArray<MidiNote>;
  selectedIds: ReadonlySet<string>;
  geometry: PianoRollGeometry;
  widthPx: number;
  onGestureStart: () => void;
  onVelocityChange: (noteId: string, velocity: number) => void;
  onGestureEnd: () => void;
}

export const PianoRollVelocityLane: React.FC<PianoRollVelocityLaneProps> = memo(
  ({
    notes,
    selectedIds,
    geometry,
    widthPx,
    onGestureStart,
    onVelocityChange,
    onGestureEnd
  }) => {
    const theme = useTheme();
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
      canvas.height = VELOCITY_LANE_HEIGHT_PX * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = colors.whiteRow;
      ctx.fillRect(0, 0, widthPx, VELOCITY_LANE_HEIGHT_PX);

      for (const note of notes) {
        const rect = noteRect(note, geometry);
        if (rect.x > widthPx || rect.x + rect.width < 0) continue;
        const height =
          (note.velocity / MAX_VELOCITY) * VELOCITY_LANE_HEIGHT_PX;
        ctx.fillStyle = selectedIds.has(note.id)
          ? colors.noteSelected
          : colors.note;
        ctx.fillRect(
          rect.x,
          VELOCITY_LANE_HEIGHT_PX - height,
          4,
          height
        );
        ctx.fillRect(rect.x, VELOCITY_LANE_HEIGHT_PX - height, MIN_BAR_WIDTH_PX, 4);
      }
    }, [theme, activeMode, notes, selectedIds, geometry, widthPx]);

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
          velocityAtY(e.clientY - rect.top, VELOCITY_LANE_HEIGHT_PX)
        );
        if (typeof e.currentTarget.setPointerCapture === "function") {
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // No capture: the drag still works while the pointer stays inside.
          }
        }
      },
      [noteAtX, onGestureStart, onVelocityChange]
    );

    const handlePointerMove = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        const id = draggingIdRef.current;
        if (id === null) return;
        const rect = e.currentTarget.getBoundingClientRect();
        onVelocityChange(
          id,
          velocityAtY(e.clientY - rect.top, VELOCITY_LANE_HEIGHT_PX)
        );
      },
      [onVelocityChange]
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
        style={{ height: VELOCITY_LANE_HEIGHT_PX }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        aria-label="Note velocities"
        role="img"
      />
    );
  }
);

PianoRollVelocityLane.displayName = "PianoRollVelocityLane";
