/**
 * A responsive grid of selectable option cards (PRD § 6.3): the storyboard
 * genre grid, the video and script format cards, the image use-case cards, the
 * workflow category cards. Single select.
 */

import React, { memo } from "react";
import { alpha, useTheme } from "@mui/material/styles";

import {
  BORDER_RADIUS,
  Box,
  Caption,
  FlexColumn,
  GAP,
  PADDING,
  ResponsiveImage,
  Text
} from "../ui_primitives";
import type { MediaLocator } from "../../hooks/useResolvedMediaUri";
import { SetupCardButton, useRovingRadioGroup } from "./SetupCardButton";
import type { SetupCardGridMode } from "./SetupCardButton";

export interface OptionCardItem {
  id: string;
  title: string;
  /** One line under the title. */
  description?: string;
  /**
   * The card's numbers, on their own line under the description — a format's
   * "15s · 16:9 · 30fps". They are what the choice decides, so they do not
   * belong inside the prose.
   */
  meta?: string;
  /** Card art, as a stored locator. `ResponsiveImage` resolves it. */
  image?: MediaLocator;
  disabled?: boolean;
  /** Why the card is off — a tooltip, and the card's accessible description. */
  disabledReason?: string;
}

export interface OptionCardGridProps {
  /** Accessible name for the group, e.g. "Genre". */
  label: string;
  options: readonly OptionCardItem[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  /** Narrowest a card gets before the grid drops a column, in px. */
  minColumnWidth?: number;
  /**
   * `single-select` is a mutually exclusive choice: the cards are radios with
   * one tab stop and arrow-key movement. `navigation` is a row of cards that
   * each open something, so they carry no selection state and each is its own
   * tab stop. Defaults by whether the caller tracks a selection at all.
   */
  mode?: SetupCardGridMode;
  /**
   * `media` fills the card with its art and lays the text over it, so the
   * picture is what the eye picks from — the genre grid, where fourteen
   * one-word titles say far less than fourteen frames. `text` keeps the art as
   * a plate above the text. A card with no art is a text card either way.
   */
  variant?: "text" | "media";
}

/** The stack of title, description and meta every card carries. */
const CardText: React.FC<{ option: OptionCardItem; onImage: boolean }> = ({
  option,
  onImage
}) => {
  // Over a still, every line takes the overlay's colour: the muted greys the
  // text cards use are unreadable against a photograph.
  const inherit = onImage ? { color: "inherit" } : undefined;
  return (
    <FlexColumn gap={GAP.tight}>
      <Text size="normal" component="span" sx={inherit}>
        {option.title}
      </Text>
      {option.description ? (
        <Caption
          component="span"
          color={onImage ? undefined : "secondary"}
          sx={inherit}
        >
          {option.description}
        </Caption>
      ) : null}
      {option.meta ? (
        <Caption
          component="span"
          color={onImage ? undefined : "muted"}
          sx={inherit}
        >
          {option.meta}
        </Caption>
      ) : null}
    </FlexColumn>
  );
};

/** A card whose art is the tile, with the text laid over its lower edge. */
const MediaCard: React.FC<{ option: OptionCardItem; image: MediaLocator }> = ({
  option,
  image
}) => {
  const theme = useTheme();
  const black = theme.palette.common.black;
  return (
    <Box sx={{ position: "relative" }}>
      <ResponsiveImage
        locator={image}
        alt=""
        aspectRatio="16/9"
        sx={{ display: "block" }}
      />
      {/* The still decides the contrast under the title, so the text brings its
          own ground: a scrim dark enough to read white on, whatever the frame. */}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "flex-end",
          padding: PADDING.compact,
          color: theme.vars.palette.common.white,
          background: `linear-gradient(to top, ${alpha(black, 0.82)} 0%, ${alpha(
            black,
            0.45
          )} 38%, ${alpha(black, 0)} 72%)`
        }}
      >
        <CardText option={option} onImage />
      </Box>
    </Box>
  );
};

const OptionCardGridInternal: React.FC<OptionCardGridProps> = ({
  label,
  options,
  selectedId,
  onSelect,
  minColumnWidth = 300,
  variant = "text",
  // A caller that tracks a selection is picking one of a set; a caller that
  // does not is routing somewhere. The entry grids are the latter.
  mode = selectedId === undefined ? "navigation" : "single-select"
}) => {
  const single = mode === "single-select";
  const radioProps = useRovingRadioGroup(options, selectedId, onSelect);
  return (
    <Box
      role={single ? "radiogroup" : "group"}
      aria-label={label}
      sx={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${minColumnWidth}px), 1fr))`,
        gap: GAP.comfortable
      }}
    >
      {options.map((option) => {
        const filled = variant === "media" && option.image !== undefined;
        return (
          <SetupCardButton
            key={option.id}
            {...(single
              ? radioProps(option)
              : { role: "navigation" as const })}
            disabled={option.disabled}
            disabledReason={option.disabledReason}
            padding={filled ? PADDING.none : undefined}
            onSelect={() => onSelect(option.id)}
          >
            {filled ? (
              <MediaCard option={option} image={option.image as MediaLocator} />
            ) : (
              <FlexColumn gap={GAP.tight}>
                {/* No art, no plate: a card with a grey box holding its own
                    title says the same thing twice and promises a picture that
                    is not coming. Such a card is text only, and the grid packs
                    tighter. */}
                {option.image !== undefined ? (
                  <ResponsiveImage
                    locator={option.image}
                    alt=""
                    aspectRatio="16/9"
                    borderRadius={BORDER_RADIUS.sm}
                  />
                ) : null}
                <CardText option={option} onImage={false} />
              </FlexColumn>
            )}
          </SetupCardButton>
        );
      })}
    </Box>
  );
};

export const OptionCardGrid = memo(OptionCardGridInternal);
OptionCardGrid.displayName = "OptionCardGrid";

export default OptionCardGrid;
