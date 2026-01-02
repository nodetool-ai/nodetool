/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useRef, useEffect, useMemo } from "react";
import { Box } from "@mui/material";
import { useTheme, Theme } from "@mui/material/styles";
import Clip, { ClipProps } from "./Clip";
import { useVideoThumbnails } from "../../hooks/timeline/useVideoThumbnails";

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
      left: 0,
      right: 0
    },

    ".thumbnail-img": {
      height: "100%",
      objectFit: "cover",
      flexShrink: 0,
      borderRight: "1px solid rgba(0, 0, 0, 0.2)"
    },

    ".thumbnail-placeholder": {
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      borderRight: "1px solid rgba(0, 0, 0, 0.2)"
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

// Maximum number of thumbnails to extract per clip for performance
const MAX_THUMBNAILS_PER_CLIP = 20;

const VideoClip: React.FC<VideoClipProps> = (props) => {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { clip, width } = props;

  // Calculate thumbnail dimensions
  const aspectRatio = 16 / 9;
  const containerHeight = 40;
  const thumbnailWidth = containerHeight * aspectRatio;
  const numThumbnails = Math.max(1, Math.ceil(width / thumbnailWidth));

  // Use the video thumbnails hook
  const { thumbnails: thumbnailData, isLoading } = useVideoThumbnails({
    url: clip.sourceUrl,
    durationHint: clip.sourceDuration,
    numThumbnails: Math.min(numThumbnails, MAX_THUMBNAILS_PER_CLIP),
    thumbnailWidth: Math.round(thumbnailWidth * 2), // Higher res for quality
    usePlaceholder: !clip.sourceUrl
  });

  // Get the thumbnails to display based on visible portion
  const visibleThumbnails = useMemo(() => {
    if (!thumbnailData) return [];

    const startPercent = clip.inPoint / clip.sourceDuration;
    const endPercent = clip.outPoint / clip.sourceDuration;
    const visibleDuration = endPercent - startPercent;

    // Filter thumbnails that fall within the visible time range
    const result: Array<{ dataUrl: string; time: number; width: number }> = [];

    for (let i = 0; i < numThumbnails; i++) {
      const thumbPercent =
        startPercent + (i / numThumbnails) * visibleDuration;
      const thumbTime = thumbPercent * thumbnailData.duration;

      // Find the closest thumbnail
      let closest = thumbnailData.thumbnails[0];
      let minDiff = Math.abs(closest.time - thumbTime);

      for (const thumb of thumbnailData.thumbnails) {
        const diff = Math.abs(thumb.time - thumbTime);
        if (diff < minDiff) {
          minDiff = diff;
          closest = thumb;
        }
      }

      result.push({
        dataUrl: closest?.dataUrl || "",
        time: thumbTime,
        width: width / numThumbnails
      });
    }

    return result;
  }, [thumbnailData, clip.inPoint, clip.outPoint, clip.sourceDuration, width, numThumbnails]);

  // Check if we have real thumbnails with data
  const hasRealThumbnails = visibleThumbnails.some((t) => t.dataUrl);

  // Determine if we should show placeholder canvas (loading or no real thumbnails)
  const showPlaceholderCanvas = isLoading || !hasRealThumbnails;

  // Draw placeholder thumbnails on canvas if loading or no real thumbnails
  useEffect(() => {
    const canvas = canvasRef.current;
    // Only draw if we're showing the placeholder canvas
    if (!canvas || !showPlaceholderCanvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    // Avoid drawing on zero-size canvas
    if (rect.width === 0 || rect.height === 0) return;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, rect.width, rect.height);

    // Draw placeholder pattern
    const startPercent = clip.inPoint / clip.sourceDuration;
    const endPercent = clip.outPoint / clip.sourceDuration;
    const thumbWidth = rect.width / numThumbnails;

    for (let i = 0; i < numThumbnails; i++) {
      const x = i * thumbWidth;
      const timePercent =
        startPercent + (i / numThumbnails) * (endPercent - startPercent);
      const hue = (timePercent * 120) % 360;

      ctx.fillStyle = `hsla(${hue}, 30%, 30%, 0.8)`;
      ctx.fillRect(x, 0, thumbWidth - 1, rect.height);

      // Draw play triangle
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
  }, [showPlaceholderCanvas, clip.inPoint, clip.outPoint, clip.sourceDuration, width, numThumbnails]);

  return (
    <Clip {...props}>
      <Box css={styles(theme)} className="video-clip-content">
        <div className="thumbnail-container">
          {hasRealThumbnails ? (
            <div className="thumbnail-strip">
              {visibleThumbnails.map((thumb, index) => (
                thumb.dataUrl ? (
                  <img
                    key={index}
                    src={thumb.dataUrl}
                    alt=""
                    className="thumbnail-img"
                    style={{ width: thumb.width }}
                  />
                ) : (
                  <div
                    key={index}
                    className="thumbnail-placeholder"
                    style={{
                      width: thumb.width,
                      backgroundColor: `hsla(${(thumb.time / clip.sourceDuration) * 120}, 30%, 30%, 0.8)`
                    }}
                  />
                )
              ))}
            </div>
          ) : (
            <canvas ref={canvasRef} className="thumbnail-canvas" />
          )}
        </div>
      </Box>
    </Clip>
  );
};

export default React.memo(VideoClip);
