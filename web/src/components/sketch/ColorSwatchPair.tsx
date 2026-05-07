/**
 * ColorSwatchPair
 *
 * FG/BG color swatches for the left toolbar.
 * Clicking a swatch opens ColorPickerPopover (custom HSV picker).
 * Swap and Reset buttons below the swatches.
 */

import React, { memo, useState, useCallback } from "react";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import {
  Container,
  FlexColumn,
  FlexRow,
  Text,
  ToolbarIconButton,
  Tooltip
} from "../ui_primitives";
import { colorToHex6 } from "./types";
import { SKETCH_FONT, SKETCH_SPACING, SKETCH_COLORS, SKETCH_TOOLTIP_DELAY_MS, colorSwatchSx } from "./sketchStyles";
import ColorPickerPopover from "./ColorPickerPopover";

export interface ColorSwatchPairProps {
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
  const [fgAnchor, setFgAnchor] = useState<HTMLElement | null>(null);
  const [bgAnchor, setBgAnchor] = useState<HTMLElement | null>(null);
  const [fgInitialColor, setFgInitialColor] = useState(foregroundColor);
  const [bgInitialColor, setBgInitialColor] = useState(backgroundColor);

  const fgHex6 = colorToHex6(foregroundColor);
  const bgHex6 = colorToHex6(backgroundColor);

  const handleFgClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    setFgInitialColor(foregroundColor);
    setFgAnchor(e.currentTarget);
  }, [foregroundColor]);
  const handleBgClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    setBgInitialColor(backgroundColor);
    setBgAnchor(e.currentTarget);
  }, [backgroundColor]);

  return (
    <FlexColumn
      className="color-swatch-pair"
      sx={{ width: "100%", alignItems: "center", gap: SKETCH_SPACING.sm }}
    >

      {/* ── Swatches ── */}
      <FlexRow
        className="color-swatch-pair__swatches"
        align="flex-end"
        justify="center"
        sx={{ gap: SKETCH_SPACING.md }}
      >
        <FlexColumn sx={{ alignItems: "center", gap: "1px" }}>
          <Text sx={{ fontSize: SKETCH_FONT.xxs, color: SKETCH_COLORS.textMuted, userSelect: "none" }}>FG</Text>
          <Tooltip title="Foreground Color" placement="right" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
            <Container
              className="color-swatch-pair__fg"
              padding="none"
              onClick={handleFgClick}
              sx={colorSwatchSx}
            >
              <Container
                padding="none"
                sx={{ position: "absolute", inset: 0, backgroundColor: fgHex6 }}
              />
            </Container>
          </Tooltip>
        </FlexColumn>

        <FlexColumn sx={{ alignItems: "center", gap: "1px" }}>
          <Text sx={{ fontSize: SKETCH_FONT.xxs, color: SKETCH_COLORS.textMuted, userSelect: "none" }}>BG</Text>
          <Tooltip title="Background Color" placement="right" enterDelay={SKETCH_TOOLTIP_DELAY_MS} enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}>
            <Container
              className="color-swatch-pair__bg"
              padding="none"
              onClick={handleBgClick}
              sx={colorSwatchSx}
            >
              <Container
                padding="none"
                sx={{ position: "absolute", inset: 0, backgroundColor: bgHex6 }}
              />
            </Container>
          </Tooltip>
        </FlexColumn>
      </FlexRow>

      {/* ── Swap / Reset ── */}
      <FlexRow className="color-swatch-pair__actions" align="center" sx={{ width: "54px" }}>
        <ToolbarIconButton
          tooltip="Swap Colors (X)"
          tooltipPlacement="right"
          delay={SKETCH_TOOLTIP_DELAY_MS}
          onClick={onSwapColors}
          icon={<SwapHorizIcon sx={{ fontSize: "13px" }} />}
          sx={{ flex: 1, padding: SKETCH_SPACING.xs, borderRadius: "3px" }}
        />
        <ToolbarIconButton
          tooltip="Reset to B/W (D)"
          tooltipPlacement="right"
          delay={SKETCH_TOOLTIP_DELAY_MS}
          onClick={onResetColors}
          icon={<Text sx={{ fontSize: SKETCH_FONT.xxs, fontWeight: 700, lineHeight: 1 }}>D</Text>}
          sx={{ flex: 1, padding: SKETCH_SPACING.xs, borderRadius: "3px" }}
        />
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
