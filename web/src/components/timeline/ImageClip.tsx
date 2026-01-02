/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useMemo } from "react";
import { Box, Typography } from "@mui/material";
import { useTheme, Theme } from "@mui/material/styles";
import ImageIcon from "@mui/icons-material/Image";
import Clip, { ClipProps } from "./Clip";

// Thumbnail size in pixels - each repeat shows this width
const THUMBNAIL_WIDTH = 60;

const styles = (_theme: Theme) =>
  css({
    ".image-container": {
      width: "100%",
      height: "100%",
      position: "relative",
      display: "flex",
      alignItems: "stretch",
      overflow: "hidden"
    },

    ".image-thumbnails": {
      display: "flex",
      width: "100%",
      height: "100%"
    },

    ".image-thumbnail": {
      height: "100%",
      flexShrink: 0,
      objectFit: "cover",
      opacity: 0.8,
      borderRight: "1px solid rgba(0, 0, 0, 0.3)"
    },

    ".image-thumbnail:last-child": {
      borderRight: "none"
    },

    ".image-placeholder": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      height: "100%",
      gap: "2px",
      color: "rgba(255, 255, 255, 0.5)",

      "& svg": {
        fontSize: "1rem"
      },

      "& .duration-text": {
        fontSize: "0.55rem"
      }
    },

    ".image-pattern": {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundImage: `repeating-linear-gradient(
        45deg,
        transparent,
        transparent 10px,
        rgba(255, 255, 255, 0.03) 10px,
        rgba(255, 255, 255, 0.03) 20px
      )`,
      pointerEvents: "none"
    }
  });

type ImageClipProps = Omit<ClipProps, "children">;

const ImageClip: React.FC<ImageClipProps> = (props) => {
  const theme = useTheme();
  const { clip, width } = props;

  // Calculate how many thumbnails to show based on clip width
  const thumbnailCount = useMemo(() => {
    if (!width || width <= 0) {
      return 1;
    }
    // At least 1 thumbnail, then repeat every THUMBNAIL_WIDTH pixels
    return Math.max(1, Math.ceil(width / THUMBNAIL_WIDTH));
  }, [width]);

  // Format duration
  const formatDuration = (seconds: number): string => {
    if (seconds < 1) {
      return `${Math.round(seconds * 1000)}ms`;
    }
    const secs = Math.floor(seconds);
    return `${secs}s`;
  };

  return (
    <Clip {...props}>
      <Box css={styles(theme)} className="image-clip-content">
        <div className="image-container">
          {clip.sourceUrl ? (
            <>
              <div className="image-thumbnails">
                {Array.from({ length: thumbnailCount }).map((_, index) => (
                  <img
                    key={index}
                    src={clip.sourceUrl}
                    alt={clip.name}
                    className="image-thumbnail"
                    style={{
                      width: `${THUMBNAIL_WIDTH}px`,
                      minWidth: `${THUMBNAIL_WIDTH}px`
                    }}
                    onError={(e) => {
                      // Hide broken image
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ))}
              </div>
              <div className="image-pattern" />
            </>
          ) : (
            <div className="image-placeholder">
              <ImageIcon />
              <Typography className="duration-text">
                {formatDuration(clip.duration)}
              </Typography>
            </div>
          )}
        </div>
      </Box>
    </Clip>
  );
};

export default React.memo(ImageClip);
