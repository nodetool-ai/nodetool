/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore
} from "react";

import {
  numChannels,
  numFrames,
  sampleDuration,
  type AudioSample
} from "./audioSample";
import { buildChannelPeaks, peakRange } from "./waveformPeaks";
import type { PlayheadStore } from "./playheadStore";

export interface Selection {
  start: number;
  end: number;
}

interface WaveformViewProps {
  sample: AudioSample;
  /** Horizontal scale; total content width is `duration * pixelsPerSecond`. */
  pixelsPerSecond: number;
  selection: Selection | null;
  playhead: PlayheadStore;
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
      position: "sticky",
      top: 0,
      left: 0,
      display: "block",
      pointerEvents: "none"
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

/** Positioned line that tracks the playhead store without re-rendering the view. */
const PlayheadLine = memo(function PlayheadLine({
  playhead,
  pixelsPerSecond
}: {
  playhead: PlayheadStore;
  pixelsPerSecond: number;
}) {
  const seconds = useSyncExternalStore(
    playhead.subscribe,
    playhead.get,
    playhead.get
  );
  return (
    <div
      className="playhead"
      style={{ left: `${seconds * pixelsPerSecond}px` }}
    />
  );
});

/**
 * Canvas waveform with click-to-seek and drag-to-select. Channels are drawn as
 * stacked min/max lanes.
 *
 * The canvas is viewport-sized and sticky inside a wide scrollable inner div:
 * only the visible slice is ever painted, and per-column min/max comes from a
 * peak cache built once per sample. Redraws (scroll, zoom, resize) therefore
 * cost O(visible pixels), not O(total frames), and the canvas never hits the
 * browser's per-dimension size limit at high zoom. The selection band and
 * playhead are positioned DOM nodes, so selecting and playback don't repaint
 * the canvas at all.
 */
const WaveformView = memo(function WaveformView({
  sample,
  pixelsPerSecond,
  selection,
  playhead,
  onSelectionChange,
  onSeek
}: WaveformViewProps) {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ startX: number; moved: boolean } | null>(null);

  const duration = sampleDuration(sample);
  const width = Math.max(1, Math.ceil(duration * pixelsPerSecond));

  const peaks = useMemo(
    () => sample.channels.map((channel) => buildChannelPeaks(channel)),
    [sample]
  );

  const waveColor = theme.palette.grey[300];
  const midColor = theme.palette.grey[700];
  const rulerColor = theme.palette.text.secondary;
  const rulerLineColor = theme.palette.divider;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const viewportWidth = container.clientWidth;
    const height = container.clientHeight;
    if (viewportWidth === 0 || height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const deviceWidth = Math.floor(viewportWidth * dpr);
    const deviceHeight = Math.floor(height * dpr);
    if (canvas.width !== deviceWidth) canvas.width = deviceWidth;
    if (canvas.height !== deviceHeight) canvas.height = deviceHeight;
    const cssWidth = `${viewportWidth}px`;
    const cssHeight = `${height}px`;
    if (canvas.style.width !== cssWidth) canvas.style.width = cssWidth;
    if (canvas.style.height !== cssHeight) canvas.style.height = cssHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewportWidth, height);

    const scrollX = Math.max(0, Math.round(container.scrollLeft));
    const contentWidth = Math.max(1, Math.ceil(duration * pixelsPerSecond));
    const drawWidth = Math.max(0, Math.min(viewportWidth, contentWidth - scrollX));
    const waveformHeight = Math.max(1, height - RULER_HEIGHT);

    const tickInterval = chooseTickInterval(pixelsPerSecond);
    ctx.strokeStyle = rulerLineColor;
    ctx.fillStyle = rulerColor;
    ctx.font = `${theme.fontSizeTiny} ${theme.fontFamily2}`;
    ctx.textBaseline = "top";
    ctx.beginPath();
    ctx.moveTo(0, RULER_HEIGHT - 0.5);
    ctx.lineTo(viewportWidth, RULER_HEIGHT - 0.5);
    // Start one tick early so a label whose tick sits just left of the
    // viewport still renders its visible text.
    const firstTick =
      Math.max(0, Math.floor(scrollX / pixelsPerSecond / tickInterval) - 1) *
      tickInterval;
    const lastVisibleSec = Math.min(
      duration,
      (scrollX + viewportWidth) / pixelsPerSecond
    );
    for (let t = firstTick; t <= lastVisibleSec; t += tickInterval) {
      const x = Math.round(t * pixelsPerSecond - scrollX) + 0.5;
      ctx.moveTo(x, RULER_HEIGHT - 8);
      ctx.lineTo(x, RULER_HEIGHT);
      ctx.fillText(formatRulerTime(t, tickInterval), x + 4, 4);
    }
    ctx.stroke();

    const channels = sample.channels;
    const lanes = numChannels(sample);
    const laneHeight = waveformHeight / lanes;
    const frames = numFrames(sample);
    const framesPerPx = sample.sampleRate / pixelsPerSecond;

    for (let c = 0; c < lanes; c += 1) {
      const data = channels[c];
      const channelPeaks = peaks[c];
      const mid = RULER_HEIGHT + laneHeight * c + laneHeight / 2;
      const amp = (laneHeight / 2) * 0.92;

      ctx.fillStyle = midColor;
      ctx.fillRect(0, Math.round(mid), drawWidth, 1);

      ctx.fillStyle = waveColor;
      for (let px = 0; px < drawWidth; px += 1) {
        const contentX = scrollX + px;
        const startI = Math.floor(contentX * framesPerPx);
        const endI = Math.min(frames, Math.floor((contentX + 1) * framesPerPx));
        let min: number;
        let max: number;
        if (endI <= startI) {
          const v = data[Math.min(startI, frames - 1)] ?? 0;
          min = v;
          max = v;
        } else {
          const peak = peakRange(data, channelPeaks, startI, endI);
          if (!peak) continue;
          min = peak.min;
          max = peak.max;
        }
        const yMax = mid - max * amp;
        const yMin = mid - min * amp;
        ctx.fillRect(px, yMax, 1, Math.max(1, yMin - yMax));
      }
    }
  }, [
    sample,
    peaks,
    duration,
    pixelsPerSecond,
    waveColor,
    midColor,
    rulerColor,
    rulerLineColor,
    theme.fontSizeTiny,
    theme.fontFamily2
  ]);

  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    draw();
  }, [draw]);

  // Repaint the visible slice on scroll and container resize, at most once per
  // animation frame.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let raf: number | null = null;
    const schedule = () => {
      if (raf != null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        drawRef.current();
      });
    };
    container.addEventListener("scroll", schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    return () => {
      container.removeEventListener("scroll", schedule);
      observer.disconnect();
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, []);

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

  const containerStyles = useMemo(() => styles(theme), [theme]);

  return (
    <div ref={containerRef} css={containerStyles} className="waveform-view">
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
        <PlayheadLine playhead={playhead} pixelsPerSecond={pixelsPerSecond} />
      </div>
    </div>
  );
});

export default WaveformView;
