/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Box } from "@mui/material";

interface ImageDimensionsProps {
  width: number;
  height: number;
}

const styles = css({
  position: "absolute",
  bottom: 4,
  left: "50%",
  width: "fit-content",
  transform: "translateX(-50%)",
  zIndex: "var(--zIndexFab)",
  display: "flex",
  gap: "4px",
  transition: "opacity 0.2s ease",
  pointerEvents: "none",
  backgroundColor: "rgba(0, 0, 0, 0.4)",
  color: "#eee",
  padding: "0 .5em",
  borderRadius: 1,
  fontSize: "var(--fontSizeSmaller)",
  fontFamily: "var(--fontFamily2)"
});

const ImageDimensions: React.FC<ImageDimensionsProps> = ({ width, height }) => {
  return (
    <Box css={styles} className="image-dimensions">
      {width}×{height}
    </Box>
  );
};

export default ImageDimensions;
