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
import { useColorScheme, useTheme } from "@mui/material/styles";
import {
  activeLoopMs,
  expandMidiLoop,
  ticksToMs,
  visibleNotes
} from "@nodetool-ai/timeline";
import type { MidiControllerLane, MidiNote } from "@nodetool-ai/timeline";
import { controllerCurveVertices, curveLane } from "./midiCurve";

/** The controller curve is drawn at this opacity over the note lines. */
const CURVE_OPACITY = 0.7;

const canvasStyles = css({
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
  zIndex: 0,
  display: "block",
  width: "100%",
  height: "100%"
});

interface MidiNotesCanvasProps {
  notes: MidiNote[] | undefined;
  /** The clip's controller lanes. The first lane with a point is drawn as a curve. */
  controllers?: MidiControllerLane[];
  inPointMs: number;
  durationMs: number;
  /** Region loop: the window repeats until `durationMs`; repeats draw dimmed. */
  loopLengthMs?: number;
  bpm: number;
  widthPx: number;
}

export const MidiNotesCanvas: React.FC<MidiNotesCanvasProps> = memo(
  ({ notes, controllers, inPointMs, durationMs, loopLengthMs, bpm, widthPx }) => {
    const theme = useTheme();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    // Canvas 2D ignores a `var(--…)` fillStyle, which is what
    // `theme.vars.palette` holds, so read the active scheme's plain value.
    const { mode, systemMode } = useColorScheme();
    const activeMode = (mode === "system" ? systemMode : mode) ?? "dark";
    const color =
      theme.colorSchemes?.[activeMode]?.palette?.primary?.main ??
      theme.palette.primary.main;

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
        { notes, controllers, inPointMs, durationMs, loopLengthMs },
        bpm
      );
      const played = visibleNotes(looped, bpm);

      if (played.length > 0) {
        const pitches = played.map((n) => n.pitch);
        const lowest = Math.min(...pitches);
        const span = Math.max(1, Math.max(...pitches) - lowest);
        const barHeight = Math.max(2, Math.min(6, cssHeight / (span + 1)));
        const pxPerMs = cssWidth / durationMs;

        ctx.fillStyle = color;
        for (const note of played) {
          const startMs = ticksToMs(note.startTick, bpm) - inPointMs;
          const lengthMs = Math.min(
            ticksToMs(note.durationTick, bpm),
            durationMs - startMs
          );
          const y =
            (1 - (note.pitch - lowest) / span) * (cssHeight - barHeight) +
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
          ctx.globalAlpha = (0.35 + (note.velocity / 127) * 0.5) * repeatDim;
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
    }, [notes, controllers, inPointMs, durationMs, loopLengthMs, bpm, widthPx, color]);

    return <canvas ref={canvasRef} css={canvasStyles} aria-hidden />;
  }
);

MidiNotesCanvas.displayName = "MidiNotesCanvas";
