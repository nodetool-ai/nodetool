/** @jsxImportSource @emotion/react */
/**
 * PatternRegionCanvas: a pattern region in the tracks area (SQ27) draws its
 * rows as a compact step grid, the way Logic shows a Pattern Region. Each row
 * repeats its own cycle across the region, so rows with different lengths or
 * rates drift as they play.
 */
import React, { memo, useEffect, useRef, useState } from "react";
import { css } from "@emotion/react";
import { activeLoopMs, msToTicks, ticksToMs } from "@nodetool-ai/timeline";
import type { StepPattern } from "@nodetool-ai/timeline";
import { CLIP_NAME_BAR_PX } from "./automation/automationLayout";
import { patternRegionCells } from "../stepSequencer/stepSequencerModel";

const INSET_PX = 2;
const ON_ALPHA = 0.95;
const OFF_ALPHA = 0.18;
/** The same repeat dimming as a looped MIDI region (MidiNotesCanvas). */
const REPEAT_DIM = 0.5;
const MUTED_DIM = 0.3;

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

interface Props {
  pattern: StepPattern;
  durationMs: number;
  inPointMs: number;
  /** Region loop: the window repeats until `durationMs`; repeats draw dimmed. */
  loopLengthMs?: number;
  patternPhaseTicks?: number;
  bpm: number;
  widthPx: number;
  color: string;
}

export const PatternRegionCanvas: React.FC<Props> = memo(
  ({ pattern, durationMs, inPointMs, loopLengthMs, patternPhaseTicks = 0, bpm, widthPx, color }) => {
    const ref = useRef<HTMLCanvasElement | null>(null);
    // The track height can change without any prop change (F25).
    const [heightPx, setHeightPx] = useState(0);
    useEffect(() => {
      const canvas = ref.current;
      if (!canvas || typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver(() => setHeightPx(canvas.clientHeight));
      observer.observe(canvas);
      return () => observer.disconnect();
    }, []);
    useEffect(() => {
      const canvas = ref.current;
      if (!canvas) return;
      const w = Math.max(1, Math.floor(widthPx));
      const h = canvas.clientHeight || heightPx || 32;
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext("2d");
      if (!ctx || durationMs <= 0 || pattern.rows.length === 0) return;
      ctx.scale(dpr, dpr);
      const loopMs = activeLoopMs({ loopLengthMs, durationMs });
      const cells = patternRegionCells(pattern, {
        clipLengthTicks: msToTicks(durationMs, bpm),
        loopLengthTicks: loopMs !== undefined ? msToTicks(loopMs, bpm) : undefined,
        phaseTicks: patternPhaseTicks + msToTicks(inPointMs, bpm)
      });
      const rowH = (h - INSET_PX * 2) / pattern.rows.length;
      const pxPerMs = w / durationMs;
      ctx.fillStyle = color;
      for (const cell of cells) {
        const x = ticksToMs(cell.startTick, bpm) * pxPerMs;
        const cellW = ticksToMs(cell.lengthTicks, bpm) * pxPerMs;
        // A tied follower joins its lead: no gap between them.
        const left = cell.tied ? x - 1 : x;
        const width = Math.max(1, cellW - 1 + (cell.tied ? 1 : 0));
        ctx.globalAlpha =
          (cell.on ? ON_ALPHA : OFF_ALPHA) * (cell.muted ? MUTED_DIM : 1) * (cell.repeat ? REPEAT_DIM : 1);
        ctx.fillRect(left, INSET_PX + cell.rowIndex * rowH + 0.5, width, Math.max(1, rowH - 1));
      }
      ctx.globalAlpha = 1;
    }, [pattern, durationMs, inPointMs, loopLengthMs, patternPhaseTicks, bpm, widthPx, color, heightPx]);
    return <canvas ref={ref} css={canvasStyles} data-testid="pattern-region-canvas" />;
  }
);
PatternRegionCanvas.displayName = "PatternRegionCanvas";
