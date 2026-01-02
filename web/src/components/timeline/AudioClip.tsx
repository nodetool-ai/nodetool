/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useRef, useEffect } from "react";
import { Box } from "@mui/material";
import { useTheme, Theme } from "@mui/material/styles";
import Clip, { ClipProps } from "./Clip";
import { useWaveform } from "../../hooks/timeline/useWaveform";

const styles = (_theme: Theme) =>
  css({
    ".waveform-container": {
      width: "100%",
      height: "100%",
      position: "relative"
    },

    ".waveform-canvas": {
      width: "100%",
      height: "100%",
      display: "block"
    },

    ".waveform-loading": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      fontSize: "0.6rem",
      color: "rgba(255, 255, 255, 0.5)"
    }
  });

type AudioClipProps = Omit<ClipProps, "children">;

const AudioClip: React.FC<AudioClipProps> = (props) => {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { clip, width } = props;

  // Use the waveform hook to extract/cache audio data
  const { waveform, isLoading } = useWaveform({
    url: clip.sourceUrl,
    durationHint: clip.sourceDuration,
    targetPeaks: 1000,
    useMock: !clip.sourceUrl // Use mock if no URL
  });

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveform) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    // Set canvas size
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Calculate visible portion based on inPoint/outPoint
    const startPercent = clip.inPoint / clip.sourceDuration;
    const endPercent = clip.outPoint / clip.sourceDuration;

    const startSample = Math.floor(startPercent * waveform.peaks.length);
    const endSample = Math.floor(endPercent * waveform.peaks.length);
    const visibleSamples = endSample - startSample;

    if (visibleSamples <= 0) {
      return;
    }

    // Draw waveform
    const centerY = rect.height / 2;
    const amplitude = rect.height * 0.4;

    // Gradient for waveform
    const gradient = ctx.createLinearGradient(0, 0, 0, rect.height);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.8)");
    gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.4)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0.8)");

    ctx.fillStyle = gradient;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    ctx.lineWidth = 1;

    // Draw bars
    const barWidth = Math.max(1, rect.width / visibleSamples);
    const step = Math.max(1, Math.floor(visibleSamples / (rect.width / 2)));

    for (let i = 0; i < visibleSamples; i += step) {
      const sampleIndex = startSample + i;
      if (sampleIndex >= waveform.peaks.length) {
        break;
      }

      const value = waveform.peaks[sampleIndex];
      const barHeight = value * amplitude;
      const x = (i / visibleSamples) * rect.width;

      ctx.fillRect(x, centerY - barHeight, barWidth - 0.5, barHeight * 2);
    }

    // Draw center line
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(rect.width, centerY);
    ctx.stroke();
  }, [waveform, clip.inPoint, clip.outPoint, clip.sourceDuration, width]);

  return (
    <Clip {...props}>
      <Box css={styles(theme)} className="audio-clip-content">
        <div className="waveform-container">
          {isLoading ? (
            <div className="waveform-loading">Loading waveform...</div>
          ) : (
            <canvas ref={canvasRef} className="waveform-canvas" />
          )}
        </div>
      </Box>
    </Clip>
  );
};

export default React.memo(AudioClip);
