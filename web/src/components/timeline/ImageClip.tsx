/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import { Box, Typography } from "@mui/material";
import { useTheme, Theme } from "@mui/material/styles";
import ImageIcon from "@mui/icons-material/Image";
import Clip, { ClipProps } from "./Clip";

const styles = (theme: Theme) =>
  css({
    ".image-container": {
      width: "100%",
      height: "100%",
      position: "relative",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden"
    },

    ".image-preview": {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      opacity: 0.8
    },

    ".image-placeholder": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
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

interface ImageClipProps extends Omit<ClipProps, "children"> {
  // Additional image-specific props can be added here
}

const ImageClip: React.FC<ImageClipProps> = (props) => {
  const theme = useTheme();
  const { clip, width } = props;

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
              <img 
                src={clip.sourceUrl} 
                alt={clip.name}
                className="image-preview"
                onError={(e) => {
                  // Hide broken image
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
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
