/**
 * A grid of preset tiles, each showing a media sample, with a trailing
 * `Add your own` tile (PRD § 6.3). Used for the storyboard and image style
 * presets, the video and image model presets, and the script voice presets.
 *
 * Presets are pictures (PRD § 6.2), so every sample goes through a
 * locator-aware primitive — `ResponsiveImage` for a still, `VideoPlayer` for a
 * clip — never a raw element with a locator in `src`.
 *
 * A clip tile is laid out differently on purpose: the player carries its own
 * controls, and putting those inside the tile button would nest one focusable
 * control in another. Such a tile frames the player and puts the select
 * control beneath it.
 *
 * A preset whose art is missing or fails to load falls back to a typographic
 * sample — its name set in the space the picture would fill. A broken-image
 * glyph reads as a bug; a set name reads as a choice, and the grid stays usable
 * while art is still being made.
 */

import React, { memo, useCallback, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import { useTheme } from "@mui/material/styles";

import {
  BORDER_RADIUS,
  Box,
  FlexColumn,
  GAP,
  PADDING,
  ResponsiveImage,
  Text,
  VideoPlayer
} from "../ui_primitives";
import type { MediaLocator } from "../../hooks/useResolvedMediaUri";
import { SetupCardButton, setupCardSx } from "./SetupCardButton";

export interface PresetTile {
  id: string;
  title: string;
  /** The still sample. */
  image?: MediaLocator;
  /** A clip sample. When set it replaces the still. */
  video?: MediaLocator;
  disabled?: boolean;
  disabledReason?: string;
}

export interface PresetTileGridProps {
  /** Accessible name for the group, e.g. "Art style". */
  label: string;
  presets: readonly PresetTile[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  /** The trailing tile. */
  onAddOwn: () => void;
  addOwnLabel?: string;
  addOwnDisabled?: boolean;
  addOwnDisabledReason?: string;
  /** Sample aspect ratio, e.g. "1/1" for a voice tile. */
  aspectRatio?: string;
  minColumnWidth?: number;
}

/**
 * A preset's still sample, or its name set in the same box when there is no
 * picture to show. `showErrorFallback` is off because this component owns the
 * failure: the primitive's broken-image glyph would replace the very thing the
 * fallback is for.
 */
const StillSample: React.FC<{
  preset: PresetTile;
  aspectRatio: string;
}> = ({ preset, aspectRatio }) => {
  const theme = useTheme();
  const [failed, setFailed] = useState(false);
  const handleError = useCallback(() => setFailed(true), []);

  if (preset.image !== undefined && !failed) {
    return (
      <ResponsiveImage
        locator={preset.image}
        alt=""
        aspectRatio={aspectRatio}
        borderRadius={BORDER_RADIUS.sm}
        showErrorFallback={false}
        onError={handleError}
      />
    );
  }
  return (
    <Box
      aria-hidden
      sx={{
        aspectRatio,
        display: "grid",
        placeItems: "center",
        padding: PADDING.compact,
        borderRadius: BORDER_RADIUS.sm,
        backgroundColor: theme.vars.palette.action.hover,
        color: theme.vars.palette.text.secondary
      }}
    >
      <Text size="normal" component="span" align="center">
        {preset.title}
      </Text>
    </Box>
  );
};

const PresetTileGridInternal: React.FC<PresetTileGridProps> = ({
  label,
  presets,
  selectedId,
  onSelect,
  onAddOwn,
  addOwnLabel = "Add your own",
  addOwnDisabled,
  addOwnDisabledReason,
  aspectRatio = "16/9",
  minColumnWidth = 160
}) => {
  const theme = useTheme();
  const selectClip = useCallback(
    (preset: PresetTile) => () => {
      if (!preset.disabled) {
        onSelect(preset.id);
      }
    },
    [onSelect]
  );

  return (
    <Box
      role="group"
      aria-label={label}
      sx={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fill, minmax(${minColumnWidth}px, 1fr))`,
        gap: GAP.comfortable
      }}
    >
      {presets.map((preset) =>
        preset.video !== undefined ? (
          <FlexColumn
            key={preset.id}
            gap={GAP.none}
            sx={setupCardSx(theme, {
              selected: preset.id === selectedId,
              disabled: preset.disabled,
              padding: PADDING.none,
              interactive: false
            })}
          >
            <VideoPlayer locator={preset.video} label={`${preset.title} sample`} />
            <Box
              component="button"
              type="button"
              aria-pressed={preset.id === selectedId}
              aria-disabled={preset.disabled || undefined}
              onClick={selectClip(preset)}
              sx={{
                appearance: "none",
                background: "none",
                border: "none",
                color: "inherit",
                font: "inherit",
                textAlign: "left",
                width: "100%",
                padding: PADDING.compact,
                cursor: preset.disabled ? "not-allowed" : "pointer"
              }}
            >
              <Text size="small" component="span">
                {preset.title}
              </Text>
            </Box>
          </FlexColumn>
        ) : (
          <SetupCardButton
            key={preset.id}
            selected={preset.id === selectedId}
            disabled={preset.disabled}
            disabledReason={preset.disabledReason}
            onSelect={() => onSelect(preset.id)}
            padding={PADDING.compact}
          >
            <FlexColumn gap={GAP.tight}>
              <StillSample preset={preset} aspectRatio={aspectRatio} />
              <Text size="small" component="span">
                {preset.title}
              </Text>
            </FlexColumn>
          </SetupCardButton>
        )
      )}
      <SetupCardButton
        disabled={addOwnDisabled}
        disabledReason={addOwnDisabledReason}
        onSelect={onAddOwn}
        padding={PADDING.compact}
      >
        <FlexColumn gap={GAP.tight} align="center" justify="center">
          <Box sx={{ aspectRatio, display: "grid", placeItems: "center" }}>
            <AddIcon aria-hidden />
          </Box>
          <Text size="small" component="span">
            {addOwnLabel}
          </Text>
        </FlexColumn>
      </SetupCardButton>
    </Box>
  );
};

export const PresetTileGrid = memo(PresetTileGridInternal);
PresetTileGrid.displayName = "PresetTileGrid";

export default PresetTileGrid;
