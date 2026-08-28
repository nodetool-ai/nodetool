import React, { memo, useEffect, useRef } from "react";
import { useTheme } from "@mui/material/styles";
import { LEVEL_BUFFER_SIZE } from "../../../../hooks/browser/useMicrophoneRecorder";

interface RecordingWaveformProps {
  /** Amplitudes in [0,1], oldest first. Read per frame, never via state. */
  levelsRef: React.MutableRefObject<Float32Array>;
  height?: number;
}

const BAR_WIDTH = 2;
const BAR_GAP = 2;
const MIN_BAR_HEIGHT = 2;

/**
 * The live input meter: one bar per amplitude sample, newest at the right, the
 * whole wave sliding left as the buffer shifts.
 */
export const RecordingWaveform = memo(function RecordingWaveform({
  levelsRef,
  height = 28
}: RecordingWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const theme = useTheme();
  const barColor = theme.vars.palette.primary.main;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const draw = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      if (
        canvas.width !== Math.round(width * ratio) ||
        canvas.height !== Math.round(height * ratio)
      ) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.fillStyle = barColor;

      const levels = levelsRef.current;
      const step = BAR_WIDTH + BAR_GAP;
      const barCount = Math.min(
        LEVEL_BUFFER_SIZE,
        Math.max(1, Math.floor(width / step))
      );
      const middle = height / 2;
      for (let i = 0; i < barCount; i++) {
        // The right edge is the newest sample, so read the buffer backwards.
        const level = levels[levels.length - barCount + i] ?? 0;
        const barHeight = Math.max(MIN_BAR_HEIGHT, level * height);
        const x = width - (barCount - i) * step;
        context.fillRect(x, middle - barHeight / 2, BAR_WIDTH, barHeight);
      }
    };

    const loop = () => {
      draw();
      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [barColor, height, levelsRef]);

  return (
    <canvas
      ref={canvasRef}
      className="recording-waveform"
      role="presentation"
      style={{ width: "100%", height, display: "block" }}
    />
  );
});
