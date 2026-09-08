/** @jsxImportSource @emotion/react */
/**
 * The bars:beats ruler over the note grid.
 *
 * The lines come from `computeBarRulerTicks` — the same helper the tracks
 * ruler draws — read over the timeline milliseconds this clip's content plays
 * at, so bar 9 in the piano roll is bar 9 in the sequence rather than the
 * ninth bar of the clip.
 */

import React, { memo, useEffect, useRef } from "react";
import { css } from "@emotion/react";
import { useColorScheme, useTheme } from "@mui/material/styles";

import type { TimelineTempo } from "@nodetool-ai/timeline";
import { TYPOGRAPHY } from "../../ui_primitives";

import { computeBarRulerTicks } from "../Tracks/tempoGrid";
import { pickPianoRollColors } from "./pianoRollColors";
import { tickToX, xToTick, type PianoRollGeometry } from "./pianoRollGeometry";

/** Height of the ruler strip. */
export const PIANO_ROLL_RULER_HEIGHT_PX = 22;

const canvasStyles = css({
  display: "block",
  width: "100%",
  cursor: "pointer",
  touchAction: "none",
  ...TYPOGRAPHY.mono.caption
});

interface PianoRollRulerProps {
  geometry: PianoRollGeometry;
  widthPx: number;
  tempo: TimelineTempo;
  /** Timeline ms the content tick `t` plays at. */
  tickToTimelineMs: (tick: number) => number;
  /** The content tick playing at timeline ms `ms`. */
  timelineMsToTick: (ms: number) => number;
  onSeekTick: (tick: number) => void;
}

export const PianoRollRuler: React.FC<PianoRollRulerProps> = memo(
  ({ geometry, widthPx, tempo, tickToTimelineMs, timelineMsToTick, onSeekTick }) => {
    const theme = useTheme();
    const { mode, systemMode } = useColorScheme();
    const activeMode = (mode === "system" ? systemMode : mode) ?? "dark";
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const scrubPointer = useRef<number | null>(null);

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
      canvas.height = PIANO_ROLL_RULER_HEIGHT_PX * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = colors.whiteRow;
      ctx.fillRect(0, 0, widthPx, PIANO_ROLL_RULER_HEIGHT_PX);

      const fromMs = tickToTimelineMs(xToTick(0, geometry));
      const toMs = tickToTimelineMs(xToTick(widthPx, geometry));
      if (!(toMs > fromMs)) return;
      // The ruler helper works in ms per pixel; one pixel spans 1/pxPerTick
      // ticks, so the two zooms are the same number read in the other unit.
      const msPerPx = (toMs - fromMs) / widthPx;
      const ticks = computeBarRulerTicks({
        tempo,
        msPerPx,
        fromMs: Math.max(0, fromMs),
        toMs
      });

      ctx.textBaseline = "middle";
      const canvasStyle = getComputedStyle(canvas);
      ctx.font = `${canvasStyle.fontSize} ${canvasStyle.fontFamily}`;
      for (const tick of ticks) {
        const x = Math.round(tickToX(timelineMsToTick(tick.timeMs), geometry)) + 0.5;
        ctx.strokeStyle = tick.kind === "bar" ? colors.barLine : colors.gridLine;
        ctx.beginPath();
        ctx.moveTo(x, tick.kind === "bar" ? 2 : PIANO_ROLL_RULER_HEIGHT_PX / 2);
        ctx.lineTo(x, PIANO_ROLL_RULER_HEIGHT_PX);
        ctx.stroke();
        if (tick.label) {
          ctx.fillStyle = colors.text;
          ctx.fillText(tick.label, x + 3, PIANO_ROLL_RULER_HEIGHT_PX / 2);
        }
      }
    }, [
      theme,
      activeMode,
      geometry,
      widthPx,
      tempo,
      tickToTimelineMs,
      timelineMsToTick
    ]);

    return (
      <canvas
        ref={canvasRef}
        css={canvasStyles}
        style={{ height: PIANO_ROLL_RULER_HEIGHT_PX }}
        data-testid="piano-roll-ruler"
        title="Click or drag to position the playhead"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.closest<HTMLElement>('[data-testid="piano-roll"]')?.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          scrubPointer.current = event.pointerId;
          onSeekTick(Math.round(xToTick(event.clientX - event.currentTarget.getBoundingClientRect().left, geometry)));
        }}
        onPointerMove={(event) => {
          if (scrubPointer.current !== event.pointerId) return;
          onSeekTick(Math.round(xToTick(event.clientX - event.currentTarget.getBoundingClientRect().left, geometry)));
        }}
        onPointerUp={() => { scrubPointer.current = null; }}
        onPointerCancel={() => { scrubPointer.current = null; }}
        onLostPointerCapture={() => { scrubPointer.current = null; }}
        aria-hidden
      />
    );
  }
);

PianoRollRuler.displayName = "PianoRollRuler";
