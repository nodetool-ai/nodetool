/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  numChannels,
  numFrames,
  sampleDuration,
  type AudioSample
} from "./audioSample";

export interface Selection {
  start: number;
  end: number;
}

interface WaveformViewProps {
  sample: AudioSample;
  /** Horizontal scale; total content width is `duration * pixelsPerSecond`. */
  pixelsPerSecond: number;
  selection: Selection | null;
  playheadSec: number;
  onSelectionChange: (selection: Selection | null) => void;
  onSeek: (seconds: number) => void;
}

const styles = (theme: Theme) =>
  css({
    position: "relative",
    width: "100%",
    height: "100%",
    overflowX: "auto",
    overflowY: "hidden",
    backgroundColor: theme.vars.palette.grey[900],

    "& .waveform-inner": {
      position: "relative",
      height: "100%",
      minWidth: "100%",
      cursor: "text"
    },
    "& canvas": {
      position: "absolute",
      top: 0,
      left: 0,
      display: "block"
    },
    "& .selection": {
      position: "absolute",
      top: `${RULER_HEIGHT}px`,
      bottom: 0,
      backgroundColor: theme.vars.palette.primary.main,
      opacity: 0.22,
      pointerEvents: "none"
    },
    "& .playhead": {
      position: "absolute",
      top: 0,
      bottom: 0,
      width: "1px",
      backgroundColor: theme.vars.palette.secondary.main,
      pointerEvents: "none"
    }
  });

const DRAG_THRESHOLD_PX = 3;
const RULER_HEIGHT = 24;
const MIN_TICK_SPACING_PX = 80;
const TICK_INTERVALS_SECONDS = [
  0.01,
  0.025,
  0.05,
  0.1,
  0.25,
  0.5,
  1,
  2,
  5,
  10,
  15,
  30,
  60,
  120,
  300,
  600,
  900,
  1800,
  3600
];

const chooseTickInterval = (pixelsPerSecond: number): number => {
  const minSeconds = MIN_TICK_SPACING_PX / Math.max(1, pixelsPerSecond);
  return (
    TICK_INTERVALS_SECONDS.find((interval) => interval >= minSeconds) ??
    TICK_INTERVALS_SECONDS[TICK_INTERVALS_SECONDS.length - 1]
  );
};

const formatRulerTime = (seconds: number, interval: number): string => {
  if (interval < 1) {
    return `${seconds.toFixed(interval < 0.1 ? 2 : 1)}s`;
  }

  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(
      2,
      "0"
    )}`;
  }

  return `${minutes}:${String(secs).padStart(2, "0")}`;
};

/**
 * Canvas waveform with click-to-seek and drag-to-select. Channels are drawn as
 * stacked min/max lanes. The waveform canvas only repaints when the sample,
 * zoom, or size changes; the selection band and playhead are positioned DOM
 * nodes so seeking and playback don't trigger a redraw.
 */
const WaveformView = ({
  sample,
  pixelsPerSecond,
  selection,
  playheadSec,
  onSelectionChange,
  onSeek
}: WaveformViewProps) => {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ startX: number; moved: boolean } | null>(null);

  const duration = sampleDuration(sample);
  const width = Math.max(1, Math.ceil(duration * pixelsPerSecond));

  const waveColor = theme.palette.grey[300];
  const midColor = theme.palette.grey[700];
  const rulerColor = theme.palette.text.secondary;
  const rulerLineColor = theme.palette.divider;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const height = container.clientHeight;
    const waveformHeight = Math.max(1, height - RULER_HEIGHT);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const tickInterval = chooseTickInterval(pixelsPerSecond);
    ctx.strokeStyle = rulerLineColor;
    ctx.fillStyle = rulerColor;
    ctx.font = `${theme.fontSizeTiny} ${theme.fontFamily2}`;
    ctx.textBaseline = "top";
    ctx.beginPath();
    ctx.moveTo(0, RULER_HEIGHT - 0.5);
    ctx.lineTo(width, RULER_HEIGHT - 0.5);
    for (let t = 0; t <= duration; t += tickInterval) {
      const x = Math.round(t * pixelsPerSecond) + 0.5;
      ctx.moveTo(x, RULER_HEIGHT - 8);
      ctx.lineTo(x, RULER_HEIGHT);
      ctx.fillText(formatRulerTime(t, tickInterval), x + 4, 4);
    }
    ctx.stroke();

    const channels = sample.channels;
    const lanes = numChannels(sample);
    const laneHeight = waveformHeight / lanes;
    const frames = numFrames(sample);
    const samplesPerPx = frames / width;

    for (let c = 0; c < lanes; c += 1) {
      const data = channels[c];
      const mid = RULER_HEIGHT + laneHeight * c + laneHeight / 2;
      const amp = (laneHeight / 2) * 0.92;

      ctx.fillStyle = midColor;
      ctx.fillRect(0, Math.round(mid), width, 1);

      ctx.fillStyle = waveColor;
      for (let x = 0; x < width; x += 1) {
        const startI = Math.floor(x * samplesPerPx);
        const endI = Math.min(frames, Math.floor((x + 1) * samplesPerPx));
        let min = 1;
        let max = -1;
        if (endI <= startI) {
          const v = data[Math.min(startI, frames - 1)] ?? 0;
          min = v;
          max = v;
        } else {
          for (let i = startI; i < endI; i += 1) {
            const v = data[i];
            if (v < min) min = v;
            if (v > max) max = v;
          }
        }
        const yMax = mid - max * amp;
        const yMin = mid - min * amp;
        ctx.fillRect(x, yMax, 1, Math.max(1, yMin - yMax));
      }
    }
  }, [
    sample,
    width,
    duration,
    pixelsPerSecond,
    waveColor,
    midColor,
    rulerColor,
    rulerLineColor,
    theme.fontSizeTiny,
    theme.fontFamily2
  ]);

  const secondsFromEvent = useCallback(
    (clientX: number): number => {
      const inner = innerRef.current;
      if (!inner) return 0;
      const rect = inner.getBoundingClientRect();
      const x = Math.max(0, Math.min(width, clientX - rect.left));
      return pixelsPerSecond > 0 ? x / pixelsPerSecond : 0;
    },
    [pixelsPerSecond, width]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      innerRef.current?.setPointerCapture(event.pointerId);
      dragRef.current = { startX: event.clientX, moved: false };
    },
    []
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (Math.abs(event.clientX - drag.startX) > DRAG_THRESHOLD_PX) {
        drag.moved = true;
      }
      if (drag.moved) {
        const a = secondsFromEvent(drag.startX);
        const b = secondsFromEvent(event.clientX);
        onSelectionChange({ start: Math.min(a, b), end: Math.max(a, b) });
      }
    },
    [secondsFromEvent, onSelectionChange]
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (innerRef.current?.hasPointerCapture(event.pointerId)) {
        innerRef.current.releasePointerCapture(event.pointerId);
      }
      if (!drag) return;
      if (!drag.moved) {
        onSelectionChange(null);
        onSeek(secondsFromEvent(event.clientX));
      }
    },
    [secondsFromEvent, onSelectionChange, onSeek]
  );

  const selectionStyle = useMemo(() => {
    if (!selection) return undefined;
    return {
      left: `${selection.start * pixelsPerSecond}px`,
      width: `${Math.max(1, (selection.end - selection.start) * pixelsPerSecond)}px`
    };
  }, [selection, pixelsPerSecond]);

  return (
    <div ref={containerRef} css={styles(theme)} className="waveform-view">
      <div
        ref={innerRef}
        className="waveform-inner"
        style={{ width: `${width}px` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <canvas ref={canvasRef} />
        {selectionStyle && <div className="selection" style={selectionStyle} />}
        <div
          className="playhead"
          style={{ left: `${playheadSec * pixelsPerSecond}px` }}
        />
      </div>
    </div>
  );
};

export default WaveformView;
