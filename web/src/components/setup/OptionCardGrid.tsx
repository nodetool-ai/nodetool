/**
 * A responsive grid of selectable option cards (PRD § 6.3): the storyboard
 * genre grid, the video and script format cards, the image use-case cards, the
 * workflow category cards. Single select.
 */

import React, { memo } from "react";
import type { ReactNode } from "react";

import {
  BORDER_RADIUS,
  Box,
  Caption,
  FlexColumn,
  GAP,
  ResponsiveImage,
  Text
} from "../ui_primitives";
import type { MediaLocator } from "../../hooks/useResolvedMediaUri";
import { SetupCardButton } from "./SetupCardButton";

export interface OptionCardItem {
  id: string;
  title: string;
  /** One line under the title. */
  description?: string;
  /** Card art, as a stored locator. `ResponsiveImage` resolves it. */
  image?: MediaLocator;
  /** Shown when the card has no art. */
  icon?: ReactNode;
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
}

const OptionCardGridInternal: React.FC<OptionCardGridProps> = ({
  label,
  options,
  selectedId,
  onSelect,
  minColumnWidth = 200
}) => (
  <Box
    role="group"
    aria-label={label}
    sx={{
      display: "grid",
      gridTemplateColumns: `repeat(auto-fill, minmax(${minColumnWidth}px, 1fr))`,
      gap: GAP.comfortable
    }}
  >
    {options.map((option) => (
      <SetupCardButton
        key={option.id}
        selected={option.id === selectedId}
        disabled={option.disabled}
        disabledReason={option.disabledReason}
        onSelect={() => onSelect(option.id)}
      >
        <FlexColumn gap={GAP.tight}>
          {option.image !== undefined ? (
            <ResponsiveImage
              locator={option.image}
              alt=""
              aspectRatio="16/9"
              borderRadius={BORDER_RADIUS.sm}
            />
          ) : (
            option.icon
          )}
          <Text size="normal" component="span">
            {option.title}
          </Text>
          {option.description ? (
            <Caption component="span" color="secondary">
              {option.description}
            </Caption>
          ) : null}
        </FlexColumn>
      </SetupCardButton>
    ))}
  </Box>
);

export const OptionCardGrid = memo(OptionCardGridInternal);
OptionCardGrid.displayName = "OptionCardGrid";

export default OptionCardGrid;
