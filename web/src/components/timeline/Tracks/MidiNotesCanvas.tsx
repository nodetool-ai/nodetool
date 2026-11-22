/** @jsxImportSource @emotion/react */
/**
 * MidiNotesCanvas
 *
 * The note bars a midi clip shows in place of a waveform. Pitch is the
 * vertical axis, scaled to the notes actually present so a two-note part is
 * legible rather than two hairlines near the middle of 128 semitones. Only
 * the notes the clip's window plays are drawn, so trimming visibly hides
 * notes instead of redrawing the whole phrase.
 */
import React, { memo, useEffect, useRef } from "react";
import { css } from "@emotion/react";
import {
  activeLoopMs,
  expandMidiLoop,
  ticksToMs,
  visibleNotes
} from "@nodetool-ai/timeline";
import type { MidiControllerLane, MidiNote, TimelineClip } from "@nodetool-ai/timeline";
import { controllerCurveVertices, curveLane } from "./midiCurve";
import { CLIP_NAME_BAR_PX } from "./automation/automationLayout";

/** The controller curve is drawn at this opacity over the note lines. */
const CURVE_OPACITY = 0.7;
/** Space kept above and below the note lines. */
const NOTE_INSET_PX = 2;

// The lines sit in the body, below the name band (spec 2.1).
const canvasStyles = css({
  position: "absolute",
  top: CLIP_NAME_BAR_PX,
  left: 0,
  right: 0,
  bottom: 0,
  pointerEvents: "none",
  zIndex: 0,
  display: "block",
  width: "100%",
  height: `calc(100% - ${CLIP_NAME_BAR_PX}px)`
});
const insetCanvasStyles = (bottomPx: number) =>
  css({ bottom: bottomPx, height: `calc(100% - ${CLIP_NAME_BAR_PX + bottomPx}px)` });

interface MidiNotesCanvasProps {
  notes: MidiNote[] | undefined;
  /** The clip's controller lanes. The first lane with a point is drawn as a curve. */
  controllers?: MidiControllerLane[];
  inPointMs: number;
  durationMs: number;
  /** Region loop: the window repeats until `durationMs`; repeats draw dimmed. */
  loopLengthMs?: number;
  /** Region parameters (CE6): the lines show the notes as they play. */
  transpose?: number;
  velocityOffset?: number;
  quantize?: TimelineClip["quantize"];
  /** The clip's place on the timeline and `tempo.offsetMs`: a quantize snaps to the tempo grid. */
  startMs?: number;
  gridOffsetMs?: number;
  bpm: number;
  widthPx: number;
  /** Line color: the region's content tint, a plain color for canvas. */
  color: string;
  /** Space kept free at the bottom of the body, such as for the chord strip. */
  bottomInsetPx?: number;
}

export const MidiNotesCanvas: React.FC<MidiNotesCanvasProps> = memo(
  ({ notes, controllers, inPointMs, durationMs, loopLengthMs, transpose, velocityOffset, quantize, startMs, gridOffsetMs = 0, bpm, widthPx, color, bottomInsetPx = 0 }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const cssWidth = Math.max(1, Math.floor(widthPx));
      const cssHeight = canvas.clientHeight || 32;
      const dpr =
        typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      canvas.width = cssWidth * dpr;
      canvas.height = cssHeight * dpr;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      if (durationMs <= 0) return;
      // A looped clip draws its window once per repeat; the repeats are dimmed.
      const loopMs = activeLoopMs({ loopLengthMs, durationMs });
      const looped = expandMidiLoop(
        { notes, controllers, inPointMs, durationMs, loopLengthMs, startMs, transpose, velocityOffset, quantize },
        bpm,
        gridOffsetMs
      );
      const played = visibleNotes(looped, bpm);

      if (played.length > 0) {
        const pitches = played.map((n) => n.pitch);
        const lowest = Math.min(...pitches);
        const span = Math.max(1, Math.max(...pitches) - lowest);
        // Spec 2.2: lines 2 thick (or the pitch step if smaller), with a 2px
        // inset above the highest and below the lowest note.
        const barHeight = Math.max(1, Math.min(2, (cssHeight - 2 * NOTE_INSET_PX) / (span + 1)));
        const pxPerMs = cssWidth / durationMs;

        ctx.fillStyle = color;
        for (const note of played) {
          const startMs = ticksToMs(note.startTick, bpm) - inPointMs;
          const lengthMs = Math.min(
            ticksToMs(note.durationTick, bpm),
            durationMs - startMs
          );
          const y =
            NOTE_INSET_PX +
            (1 - (note.pitch - lowest) / span) * (cssHeight - 2 * NOTE_INSET_PX - barHeight) +
            barHeight / 2;
          const x = startMs * pxPerMs;
          const width = Math.max(1, lengthMs * pxPerMs);
          if (note.muted) {
            // A muted note is drawn as an outline, dimmed.
            ctx.globalAlpha = 0.45;
            ctx.strokeStyle = color;
            ctx.strokeRect(x + 0.5, y - barHeight / 2 + 0.5, Math.max(1, width - 1), Math.max(1, barHeight - 1));
            continue;
          }
          const repeatDim =
            loopMs !== undefined && startMs >= loopMs - 1e-6 ? 0.5 : 1;
          ctx.globalAlpha = (0.7 + (note.velocity / 127) * 0.3) * repeatDim;
          ctx.fillRect(x, y - barHeight / 2, width, barHeight);
        }
        ctx.globalAlpha = 1;
      }

      const vertices = controllerCurveVertices(curveLane(looped.controllers), {
        inPointMs,
        durationMs,
        bpm,
        widthPx: cssWidth,
        heightPx: cssHeight
      });
      if (vertices && vertices.length >= 2) {
        ctx.globalAlpha = CURVE_OPACITY;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        vertices.forEach((v, i) => {
          if (i === 0) ctx.moveTo(v.x, v.y);
          else ctx.lineTo(v.x, v.y);
        });
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }, [notes, controllers, inPointMs, durationMs, loopLengthMs, transpose, velocityOffset, quantize, startMs, gridOffsetMs, bpm, widthPx, color, bottomInsetPx]);

    return (
      <canvas
        ref={canvasRef}
        css={bottomInsetPx > 0 ? [canvasStyles, insetCanvasStyles(bottomInsetPx)] : canvasStyles}
        aria-hidden
      />
    );
  }
);

MidiNotesCanvas.displayName = "MidiNotesCanvas";
