/**
 * BoardMediaToggle
 *
 * The toolbar's choice between clips and stills on the shot cards. With
 * "Stills" on, every card shows its still even when the shot has a clip, so a
 * rendered board can be read frame by frame. The value is a viewing
 * preference kept in {@link useStoryboardViewStore}, so it never marks the
 * board dirty.
 */

import React, { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";

import { ToggleGroup, ToggleOption } from "../ui_primitives";
import { useStoryboardViewStore } from "../../stores/storyboard/StoryboardViewStore";

type CardMedia = "clips" | "stills";

const BoardMediaToggleInner: React.FC = () => {
  const { t } = useTranslation();
  const stillsOnly = useStoryboardViewStore((state) => state.stillsOnly);
  const setStillsOnly = useStoryboardViewStore((state) => state.setStillsOnly);

  const handleChange = useCallback(
    (_event: React.MouseEvent<HTMLElement>, value: CardMedia | null) => {
      if (value) {
        setStillsOnly(value === "stills");
      }
    },
    [setStillsOnly]
  );

  return (
    <ToggleGroup
      segmented
      exclusive
      value={stillsOnly ? "stills" : "clips"}
      onChange={handleChange}
      aria-label={t("screens4_11.storyboard.cardMedia.label")}
    >
      <ToggleOption value="clips">
        {t("screens4_11.storyboard.cardMedia.clips")}
      </ToggleOption>
      <ToggleOption value="stills">
        {t("screens4_11.storyboard.cardMedia.stills")}
      </ToggleOption>
    </ToggleGroup>
  );
};

export const BoardMediaToggle = memo(BoardMediaToggleInner);
BoardMediaToggle.displayName = "BoardMediaToggle";

export default BoardMediaToggle;
