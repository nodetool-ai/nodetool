/**
 * ColorSwatchPair
 *
 * FG/BG color swatches for the left toolbar.
 * Clicking a swatch opens ColorPickerPopover (custom HSV picker).
 * Swap and Reset buttons below the swatches.
 */

import React, { memo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import { useTheme } from "@mui/material/styles";
import {
  activateOnKey,
  Box,
  Container,
  EditorButton,
  FlexColumn,
  focusRing,
  FlexRow,
  Text,
  Tooltip,
  BORDER_RADIUS,
  Z_INDEX,
  FONT_SIZE_SANS,
  SPACING,
  getSpacingPx,
  ICON_SIZE
} from "../ui_primitives";
import { colorToHex6 } from "./types";
import { colorSwatchSx } from "./sketchStyles";
import ColorPickerPopover from "./ColorPickerPopover";

/** Square edge (px) — matches colorSwatchSx. */
const SWATCH = 24;
/** Diagonal overlap offset of the background square behind the foreground. */
const OVERLAP = 12;
/** Footprint of the overlapping pair. */
const STACK = SWATCH + OVERLAP;

interface ColorSwatchPairProps {
  foregroundColor: string;
  backgroundColor: string;
  onForegroundColorChange: (color: string) => void;
  onBackgroundColorChange: (color: string) => void;
  onSwapColors: () => void;
  onResetColors: () => void;
}

const ColorSwatchPair: React.FC<ColorSwatchPairProps> = ({
  foregroundColor,
  backgroundColor,
  onForegroundColorChange,
  onBackgroundColorChange,
  onSwapColors,
  onResetColors
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const [fgAnchor, setFgAnchor] = useState<HTMLElement | null>(null);
  const [bgAnchor, setBgAnchor] = useState<HTMLElement | null>(null);
  const [fgInitialColor, setFgInitialColor] = useState(foregroundColor);
  const [bgInitialColor, setBgInitialColor] = useState(backgroundColor);

  const fgHex6 = colorToHex6(foregroundColor);
  const bgHex6 = colorToHex6(backgroundColor);

  const handleFgClick = useCallback(
    (e: React.SyntheticEvent<HTMLElement>) => {
      setFgInitialColor(foregroundColor);
      setFgAnchor(e.currentTarget);
    },
    [foregroundColor]
  );
  const handleBgClick = useCallback(
    (e: React.SyntheticEvent<HTMLElement>) => {
      setBgInitialColor(backgroundColor);
      setBgAnchor(e.currentTarget);
    },
    [backgroundColor]
  );

  return (
    <FlexColumn
      className="color-swatch-pair"
      sx={{ width: "100%", alignItems: "center", gap: getSpacingPx(SPACING.xs) }}
    >
      {/* ── Overlapping FG (front) / BG (behind) squares, Photoshop-style ── */}
      <Box
        className="color-swatch-pair__swatches"
        sx={{
          position: "relative",
          width: STACK,
          height: STACK,
          flexShrink: 0
        }}
      >
        <Tooltip
          title={t("screens4_24.sketch.colorSwatches.backgroundColor", { value: bgHex6 })}
          placement="right"
        >
          <Container
            className="color-swatch-pair__bg"
            padding="none"
            onClick={handleBgClick}
            onKeyDown={activateOnKey(handleBgClick)}
            role="button"
            tabIndex={0}
            aria-haspopup="dialog"
            aria-label={t("screens4_24.sketch.colorSwatches.backgroundColor", { value: bgHex6 })}
            sx={{
              ...colorSwatchSx,
              "&:focus-visible": focusRing(theme, 2),
              position: "absolute",
              left: OVERLAP,
              top: OVERLAP,
              zIndex: 0
            }}
          >
            <Container
              padding="none"
              sx={{ position: "absolute", inset: 0, backgroundColor: bgHex6 }}
            />
          </Container>
        </Tooltip>

        <Tooltip
          title={t("screens4_24.sketch.colorSwatches.foregroundColor", { value: fgHex6 })}
          placement="right"
        >
          <Container
            className="color-swatch-pair__fg"
            padding="none"
            onClick={handleFgClick}
            onKeyDown={activateOnKey(handleFgClick)}
            role="button"
            tabIndex={0}
            aria-haspopup="dialog"
            aria-label={t("screens4_24.sketch.colorSwatches.foregroundColor", { value: fgHex6 })}
            sx={{
              ...colorSwatchSx,
              "&:focus-visible": focusRing(theme, 2),
              position: "absolute",
              left: 0,
              top: 0,
              zIndex: Z_INDEX.raised
            }}
          >
            <Container
              padding="none"
              sx={{ position: "absolute", inset: 0, backgroundColor: fgHex6 }}
            />
          </Container>
        </Tooltip>
      </Box>

      {/* ── Swap / Reset ── */}
      <FlexRow
        className="color-swatch-pair__actions"
        align="center"
        justify="center"
        gap={0.5}
        sx={{ width: `${STACK}px` }}
      >
        <Tooltip
          title={t("screens4_24.sketch.colorSwatches.swapColors")}
          shortcut={["X"]}
          placement="right"
        >
          <EditorButton
            density="compact"
            onClick={onSwapColors}
            aria-label={t("screens4_24.sketch.colorSwatches.swapColors")}
            sx={{ flex: 1, minWidth: 0, padding: 0, borderRadius: BORDER_RADIUS.sm }}
          >
            <SwapHorizIcon sx={{ fontSize: ICON_SIZE.xs }} />
          </EditorButton>
        </Tooltip>
        <Tooltip
          title={t("screens4_24.sketch.colorSwatches.resetColors")}
          shortcut={["D"]}
          placement="right"
        >
          <EditorButton
            density="compact"
            onClick={onResetColors}
            aria-label={t("screens4_24.sketch.colorSwatches.resetColors")}
            sx={{ flex: 1, minWidth: 0, padding: 0, borderRadius: BORDER_RADIUS.sm }}
          >
            <Text
              sx={{ fontSize: FONT_SIZE_SANS.caption, fontWeight: 600, lineHeight: 1 }}
            >
              D
            </Text>
          </EditorButton>
        </Tooltip>
      </FlexRow>

      {/* ── Pickers ── */}
      <ColorPickerPopover
        anchorEl={fgAnchor}
        color={foregroundColor}
        initialColor={fgInitialColor}
        onColorChange={onForegroundColorChange}
        onClose={() => setFgAnchor(null)}
      />
      <ColorPickerPopover
        anchorEl={bgAnchor}
        color={backgroundColor}
        initialColor={bgInitialColor}
        onColorChange={onBackgroundColorChange}
        onClose={() => setBgAnchor(null)}
      />
    </FlexColumn>
  );
};

export default memo(ColorSwatchPair);
