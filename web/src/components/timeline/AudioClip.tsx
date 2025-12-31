/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useRef, useEffect, useState } from "react";
import { Box } from "@mui/material";
import { useTheme, Theme } from "@mui/material/styles";
import Clip, { ClipProps } from "./Clip";

const styles = (theme: Theme) =>
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

interface AudioClipProps extends Omit<ClipProps, "children"> {
  // Additional audio-specific props can be added here
}

const AudioClip: React.FC<AudioClipProps> = (props) => {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [waveformData, setWaveformData] = useState<Float32Array | null>(null);

  const { clip, pixelsPerSecond, width } = props;

  // Generate mock waveform data (in a real implementation, this would come from audio analysis)
  useEffect(() => {
    // Simulate loading waveform data
    const generateMockWaveform = () => {
      const numSamples = Math.max(100, Math.floor(width / 2));
      const data = new Float32Array(numSamples);
      
      // Generate a somewhat realistic-looking waveform
      for (let i = 0; i < numSamples; i++) {
        const t = i / numSamples;
        // Combine several sine waves for a more natural look
        const base = Math.sin(t * 10 * Math.PI) * 0.3;
        const detail = Math.sin(t * 30 * Math.PI) * 0.2;
        const noise = (Math.random() - 0.5) * 0.4;
        data[i] = Math.max(-1, Math.min(1, base + detail + noise));
      }
      
      return data;
    };

    // Simulate async loading
    const timer = setTimeout(() => {
      setWaveformData(generateMockWaveform());
      setIsLoading(false);
    }, 100);

    return () => clearTimeout(timer);
  }, [width, clip.sourceUrl]);

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveformData) {
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
    
    const startSample = Math.floor(startPercent * waveformData.length);
    const endSample = Math.floor(endPercent * waveformData.length);
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
      if (sampleIndex >= waveformData.length) {
        break;
      }
      
      const value = Math.abs(waveformData[sampleIndex]);
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

  }, [waveformData, clip.inPoint, clip.outPoint, clip.sourceDuration, width]);

  return (
    <Clip {...props}>
      <Box css={styles(theme)} className="audio-clip-content">
        <div className="waveform-container">
          {isLoading ? (
            <div className="waveform-loading">Loading waveform...</div>
          ) : (
            <canvas
              ref={canvasRef}
              className="waveform-canvas"
            />
          )}
        </div>
      </Box>
    </Clip>
  );
};

export default React.memo(AudioClip);
