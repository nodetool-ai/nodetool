/**
 * BoardCardSizeSlider
 *
 * The toolbar's zoom for the shot grid: smaller cards fit a whole sequence on
 * screen, larger ones are big enough to judge a frame. The value is a viewing
 * preference kept in {@link useStoryboardViewStore}, so it never marks the
 * board dirty and every board opens at the size last chosen.
 */

import React, { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";

import { Caption, FlexRow, Slider, SPACING } from "../ui_primitives";
import {
  CARD_SIZE_STEP,
  MAX_CARD_SIZE,
  MIN_CARD_SIZE,
  useStoryboardViewStore
} from "../../stores/storyboard/StoryboardViewStore";

const sliderSx = { width: "8rem" } as const;

const BoardCardSizeSliderInner: React.FC = () => {
  const { t, i18n } = useTranslation();
  const cardSize = useStoryboardViewStore((state) => state.cardSize);
  const setCardSize = useStoryboardViewStore((state) => state.setCardSize);

  const handleChange = useCallback(
    (_event: Event, value: number | number[]) => {
      setCardSize(Array.isArray(value) ? value[0] : value);
    },
    [setCardSize]
  );

  return (
    <FlexRow align="center" gap={SPACING.sm}>
      <Caption color="secondary" id="storyboard-card-size-label">
        {t("screens4_11.storyboard.cardSize.label")}
      </Caption>
      <Slider
        density="compact"
        sx={sliderSx}
        value={cardSize}
        min={MIN_CARD_SIZE}
        max={MAX_CARD_SIZE}
        step={CARD_SIZE_STEP}
        marks
        onChange={handleChange}
        aria-labelledby="storyboard-card-size-label"
        getAriaValueText={(value) =>
          t("screens4_11.storyboard.cardSize.valueDescription", {
            count: value,
            formattedCount: new Intl.NumberFormat(
              i18n.resolvedLanguage ?? i18n.language
            ).format(value)
          })
        }
      />
    </FlexRow>
  );
};

export const BoardCardSizeSlider = memo(BoardCardSizeSliderInner);
BoardCardSizeSlider.displayName = "BoardCardSizeSlider";

export default BoardCardSizeSlider;
