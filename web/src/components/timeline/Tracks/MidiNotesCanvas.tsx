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
import { useTheme } from "@mui/material/styles";
import { ticksToMs, visibleNotes } from "@nodetool-ai/timeline";
import type { MidiNote } from "@nodetool-ai/timeline";

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
  inPointMs: number;
  durationMs: number;
  bpm: number;
  widthPx: number;
}

export const MidiNotesCanvas: React.FC<MidiNotesCanvasProps> = memo(
  ({ notes, inPointMs, durationMs, bpm, widthPx }) => {
    const theme = useTheme();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const color = theme.vars.palette.primary.main;

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

      const played = visibleNotes({ notes, inPointMs, durationMs }, bpm);
      if (played.length === 0 || durationMs <= 0) return;

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
        ctx.globalAlpha = 0.35 + (note.velocity / 127) * 0.5;
        ctx.fillRect(
          startMs * pxPerMs,
          y - barHeight / 2,
          Math.max(1, lengthMs * pxPerMs),
          barHeight
        );
      }
      ctx.globalAlpha = 1;
    }, [notes, inPointMs, durationMs, bpm, widthPx, color]);

    return <canvas ref={canvasRef} css={canvasStyles} aria-hidden />;
  }
);

MidiNotesCanvas.displayName = "MidiNotesCanvas";
