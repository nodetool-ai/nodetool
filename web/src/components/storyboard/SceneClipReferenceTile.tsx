/**
 * SceneClipReferenceTile — one image a scene clip can send to the video model.
 * Pressing the tile turns the image on or off. An image that is on shows its
 * `[Image N]` number, so the tile states what the request will hold.
 */

import React from "react";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

import {
  Box,
  Caption,
  FlexRow,
  ResponsiveImage,
  BORDER_RADIUS,
  MOTION,
  SPACING
} from "../ui_primitives";

export interface SceneClipReferenceTileProps {
  assetId?: string;
  alt: string;
  selected: boolean;
  /** Set when the tile has no image to send. */
  unavailableText?: string;
  /** `[Image 1]` while selected. */
  imageLabel?: string;
  /** The window or the entity name. */
  detail: string;
  onToggle: () => void;
  testId?: string;
}

const tileSx = {
  position: "relative",
  width: "5.5rem",
  flex: "0 0 auto",
  p: 0,
  overflow: "hidden",
  textAlign: "left",
  font: "inherit",
  color: "text.primary",
  cursor: "pointer",
  borderRadius: BORDER_RADIUS.sm,
  border: "1px solid",
  bgcolor: "c_overlay_subtle",
  transition: MOTION.border,
  "&:hover:not(:disabled)": { borderColor: "primary.main" },
  "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" },
  "&:disabled": { cursor: "not-allowed" }
} as const;

const checkSx = {
  position: "absolute",
  top: SPACING.xs,
  right: SPACING.xs,
  display: "inline-flex",
  color: "primary.main",
  bgcolor: "common.white",
  borderRadius: BORDER_RADIUS.circle
} as const;

const SceneClipReferenceTile: React.FC<SceneClipReferenceTileProps> = ({
  assetId,
  alt,
  selected,
  unavailableText,
  imageLabel,
  detail,
  onToggle,
  testId
}) => (
  <Box
    component="button"
    type="button"
    aria-pressed={selected}
    aria-label={[alt, detail, unavailableText].filter(Boolean).join(", ")}
    disabled={Boolean(unavailableText)}
    onClick={onToggle}
    data-testid={testId}
    sx={{ ...tileSx, borderColor: selected ? "primary.main" : "divider" }}
  >
    <Box sx={{ opacity: selected ? 1 : 0.45, transition: MOTION.opacity }}>
      {assetId ? (
        <ResponsiveImage
          locator={{ asset_id: assetId }}
          preferThumbnail
          loading="lazy"
          alt=""
          aspectRatio="1 / 1"
          fit="cover"
        />
      ) : (
        <FlexRow
          align="center"
          justify="center"
          sx={{ aspectRatio: "1 / 1", px: SPACING.xs, textAlign: "center" }}
        >
          <Caption color="secondary">{unavailableText}</Caption>
        </FlexRow>
      )}
    </Box>
    {selected && (
      <Box component="span" sx={checkSx}>
        <CheckCircleIcon fontSize="small" />
      </Box>
    )}
    <Box sx={{ px: SPACING.xs, py: SPACING.micro }}>
      <Caption sx={{ display: "block" }}>{imageLabel ?? " "}</Caption>
      <Caption
        color="secondary"
        sx={{
          display: "block",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }}
      >
        {detail}
      </Caption>
    </Box>
  </Box>
);

export default SceneClipReferenceTile;
