/**
 * Step 2 of the storyboard flow, first half — the genre (PRD § 7.2).
 *
 * Fourteen cards through the shared `OptionCardGrid`, each filled with its own
 * still — a genre is a look, and a frame says what one word cannot. Picking one
 * writes `board.genre`, which is what the Director prompt carries (criterion 3)
 * and what the board later shows as a chip. Nothing here generates: the genre
 * is a word on the document until "Review your screenplay" runs (D4).
 *
 * The step also carries the screenplay model, because this is the step that
 * runs the Director. `useDefaultDirectorModel` pre-fills it from the saved
 * preferences, so the picker is a change, never a required choice. Studio
 * pins its own director and hides the picker (see `curatedModels.ts`).
 */

import React, { memo, useCallback, useMemo } from "react";

import {
  Box,
  FlexColumn,
  FormField,
  GAP,
  SelectField,
  Text
} from "../../ui_primitives";
import LanguageModelSelect from "../../properties/LanguageModelSelect";
import { useInStudio } from "../../../studio/StudioContext";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useDefaultDirectorModel } from "../../../hooks/storyboard/useDefaultDirectorModel";
import type { LanguageModelValue } from "../../../stores/ApiTypes";
import { SETUP_FIELD_WIDTH } from "../layout";
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
  /** How many shots the Director is asked for. */
  shotCount: number;
  onShotCountChange: (shots: number) => void;
  /** True while the Director run is in flight. */
  directing?: boolean;
  /**
   * The board already holds a screenplay written from exactly these choices,
   * so the step's button continues to it instead of writing it again (F15).
   */
  upToDate?: boolean;
}

/**
 * What the shot picker offers. Six is the flow's default and the count the
 * board's own Direct control starts on; the ends are what a teaser and a full
 * scene need.
 */
const SHOT_OPTIONS = [3, 4, 6, 8, 10, 12].map((count) => ({
  value: String(count),
  label: `${count} shots`
}));

// The card carries its line before it is picked, the way every other option
// grid in the flow does: fourteen one-word titles say far less about the
// direction than the line under each one (F32).
const toOption = (item: StoryboardGenre): OptionCardItem => ({
  id: item.id,
  title: item.label,
  description: item.description,
  image: genreStill(item)
});

/**
 * The screenplay model, with its default. Its own component so that Studio,
 * which pins the director, mounts neither the picker nor the model catalog
 * behind it.
 */
const ScreenplayModelField: React.FC<{ boardId: string }> = ({ boardId }) => {
  // Pre-fills the picker, so the step directs without a required choice.
  useDefaultDirectorModel(boardId);
  const directorModel = useStoryboardStore(
    (state) => state.boards[boardId]?.directorModel ?? null
  );
  const setDirectorModel = useStoryboardStore(
    (state) => state.setDirectorModel
  );
  const handleChange = useCallback(
    (value: LanguageModelValue) => setDirectorModel(boardId, value),
    [boardId, setDirectorModel]
  );
  return (
    <FormField
      label="Screenplay model"
      helperText="Writes your screenplay."
      sx={{ maxWidth: SETUP_FIELD_WIDTH }}
    >
      <LanguageModelSelect
        value={directorModel?.id ?? ""}
        provider={directorModel?.provider}
        placeholder="Select model"
        onChange={handleChange}
      />
    </FormField>
  );
};

const GenreStepInternal: React.FC<GenreStepProps> = ({
  boardId,
  shotCount,
  onShotCountChange,
  directing = false,
  upToDate = false
}) => {
  const genre = useStoryboardStore(
    (state) => state.boards[boardId]?.genre ?? ""
  );
  const setSetup = useStoryboardStore((state) => state.setSetup);
  const inStudio = useInStudio();
  const handleShotCount = useCallback(
    (value: string) => onShotCountChange(Number(value)),
    [onShotCountChange]
  );

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
        variant="media"
        minColumnWidth={180}
        options={options}
        selectedId={selectedId}
        onSelect={handleSelect}
      />
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
          gap: GAP.spacious
        }}
      >
        <FormField
          label="Shots"
          helperText="How many shots the Director writes. You can add more later."
          sx={{ maxWidth: SETUP_FIELD_WIDTH }}
        >
          <SelectField
            label="Shots"
            value={String(shotCount)}
            options={SHOT_OPTIONS}
            onChange={handleShotCount}
          />
        </FormField>
        {!inStudio && <ScreenplayModelField boardId={boardId} />}
      </Box>
      {/* The shell owns the wait — it shows the animated mark and announces
          "Writing N shots" beside the button. This adds the half the mark
          cannot carry: how long to expect. It is not a live region, because
          two announcements of one wait is worse than none. */}
      {directing ? (
        <Text size="small" color="secondary">
          This usually takes about half a minute.
        </Text>
      ) : null}
      {/* Why the button says `Continue` rather than writing a screenplay: the
          one the board holds already answers these choices (F15). */}
      {!directing && upToDate ? (
        <Text size="small" color="secondary">
          Your screenplay already follows these choices. Change the genre, the
          brief or the shot count to write a new one.
        </Text>
      ) : null}
    </FlexColumn>
  );
};

export const GenreStep = memo(GenreStepInternal);
GenreStep.displayName = "GenreStep";

export default GenreStep;
