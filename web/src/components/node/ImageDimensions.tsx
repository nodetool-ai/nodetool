/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Box, MOTION, BORDER_RADIUS, SPACING, getSpacingPx } from "../ui_primitives";
import { memo } from "react";

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
  gap: getSpacingPx(SPACING.xs),
  transition: `opacity ${MOTION.normal}`,
  pointerEvents: "none",
  backgroundColor: "var(--palette-c_scrim)",
  color: "var(--palette-grey-100)",
  padding: "0 .5em",
  borderRadius: BORDER_RADIUS.xs,
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

export default memo(ImageDimensions);
