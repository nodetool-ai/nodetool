/**
 * Step 2 of the storyboard flow, first half — the genre (PRD § 7.2).
 *
 * Fourteen cards through the shared `OptionCardGrid`. Picking one writes
 * `board.genre`, which is what the Director prompt carries (criterion 3) and
 * what the board later shows as a chip. Nothing here generates: the genre is a
 * word on the document until "Review your screenplay" runs (D4).
 */

import React, { memo, useCallback, useMemo } from "react";
import { useTheme } from "@mui/material/styles";

import {
  BORDER_RADIUS,
  Box,
  FlexColumn,
  GAP,
  Text
} from "../../ui_primitives";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { OptionCardGrid } from "../OptionCardGrid";
import type { OptionCardItem } from "../OptionCardGrid";
import {
  STORYBOARD_GENRES,
  genreByLabel,
  genreStill,
  type StoryboardGenre
} from "./genres";

export interface GenreStepProps {
  boardId: string;
}

/**
 * What a card shows until its still is drawn: the genre set in type on a
 * plate the same shape as the art it stands in for, so the grid keeps its
 * rhythm instead of showing a row of broken-image icons.
 */
const GenreWordmark: React.FC<{ label: string }> = ({ label }) => {
  const theme = useTheme();
  return (
    <Box
      aria-hidden
      sx={{
        aspectRatio: "16/9",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: BORDER_RADIUS.sm,
        backgroundColor: theme.vars.palette.action.hover,
        color: theme.vars.palette.text.secondary
      }}
    >
      <Text size="big" component="span">
        {label}
      </Text>
    </Box>
  );
};

const toOption = (item: StoryboardGenre): OptionCardItem => ({
  id: item.id,
  title: item.label,
  description: item.description,
  image: genreStill(item),
  icon: <GenreWordmark label={item.label} />
});

const GenreStepInternal: React.FC<GenreStepProps> = ({ boardId }) => {
  const genre = useStoryboardStore((state) => state.boards[boardId]?.genre ?? "");
  const setSetup = useStoryboardStore((state) => state.setSetup);

  const options = useMemo(() => STORYBOARD_GENRES.map(toOption), []);
  const selectedId = genreByLabel(genre)?.id ?? null;

  const handleSelect = useCallback(
    (id: string) => {
      const picked = STORYBOARD_GENRES.find((item) => item.id === id);
      if (picked) {
        setSetup(boardId, { genre: picked.label });
      }
    },
    [boardId, setSetup]
  );

  return (
    <FlexColumn gap={GAP.comfortable}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          Choose your genre
        </Text>
        <Text size="normal" color="secondary">
          Tone, pacing and framing follow your choice. You can change it later.
        </Text>
      </FlexColumn>
      <OptionCardGrid
        label="Genre"
        options={options}
        selectedId={selectedId}
        onSelect={handleSelect}
      />
    </FlexColumn>
  );
};

export const GenreStep = memo(GenreStepInternal);
GenreStep.displayName = "GenreStep";

export default GenreStep;
