/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useRef, useEffect, useState } from "react";
import { Box } from "@mui/material";
import { useTheme, Theme } from "@mui/material/styles";
import Clip, { ClipProps } from "./Clip";

const styles = (_theme: Theme) =>
  css({
    ".thumbnail-container": {
      width: "100%",
      height: "100%",
      position: "relative",
      display: "flex",
      overflow: "hidden"
    },

    ".thumbnail-strip": {
      display: "flex",
      height: "100%",
      position: "absolute",
      top: 0,
      left: 0
    },

    ".thumbnail": {
      height: "100%",
      objectFit: "cover",
      flexShrink: 0,
      borderRight: "1px solid rgba(0, 0, 0, 0.2)"
    },

    ".thumbnail-placeholder": {
      height: "100%",
      backgroundColor: "rgba(0, 0, 0, 0.2)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      borderRight: "1px solid rgba(0, 0, 0, 0.2)",

      "& svg": {
        width: "16px",
        height: "16px",
        opacity: 0.5
      }
    },

    ".thumbnail-canvas": {
      width: "100%",
      height: "100%",
      display: "block"
    },

    ".video-loading": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      fontSize: "0.6rem",
      color: "rgba(255, 255, 255, 0.5)"
    }
  });

type VideoClipProps = Omit<ClipProps, "children">;

const VideoClip: React.FC<VideoClipProps> = (props) => {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { clip, width } = props;

  // Calculate thumbnail dimensions
  const aspectRatio = 16 / 9; // Assume 16:9 video
  const containerHeight = 40; // Approximate content height
  const thumbnailWidth = containerHeight * aspectRatio;
  const numThumbnails = Math.max(1, Math.ceil(width / thumbnailWidth));

  // Draw thumbnail placeholders
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
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

    // Calculate visible portion
    const startPercent = clip.inPoint / clip.sourceDuration;
    const endPercent = clip.outPoint / clip.sourceDuration;

    // Draw thumbnail placeholders
    const thumbWidth = rect.width / numThumbnails;

    for (let i = 0; i < numThumbnails; i++) {
      const x = i * thumbWidth;
      const timePercent =
        startPercent + (i / numThumbnails) * (endPercent - startPercent);

      // Generate a gradient based on time position (simulating video content)
      const hue = (timePercent * 120) % 360;
      ctx.fillStyle = `hsla(${hue}, 30%, 30%, 0.8)`;
      ctx.fillRect(x, 0, thumbWidth - 1, rect.height);

      // Draw a simple video frame icon
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 4, 4, thumbWidth - 9, rect.height - 8);

      // Draw play triangle in center (only for first few thumbs)
      if (i < 3 || i === numThumbnails - 1) {
        const centerX = x + thumbWidth / 2;
        const centerY = rect.height / 2;
        const triangleSize = Math.min(8, rect.height / 3);

        ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
        ctx.beginPath();
        ctx.moveTo(centerX - triangleSize / 2, centerY - triangleSize / 2);
        ctx.lineTo(centerX + triangleSize / 2, centerY);
        ctx.lineTo(centerX - triangleSize / 2, centerY + triangleSize / 2);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Draw timeline marker lines
    const markerInterval = rect.width / 10;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;

    for (let i = 1; i < 10; i++) {
      const x = i * markerInterval;
      ctx.beginPath();
      ctx.moveTo(x, rect.height - 4);
      ctx.lineTo(x, rect.height);
      ctx.stroke();
    }

    setIsLoading(false);
  }, [clip.inPoint, clip.outPoint, clip.sourceDuration, width, numThumbnails]);

  return (
    <Clip {...props}>
      <Box css={styles(theme)} className="video-clip-content">
        <div className="thumbnail-container">
          {isLoading ? (
            <div className="video-loading">Loading thumbnails...</div>
          ) : (
            <canvas ref={canvasRef} className="thumbnail-canvas" />
          )}
        </div>
      </Box>
    </Clip>
  );
};

export default React.memo(VideoClip);
