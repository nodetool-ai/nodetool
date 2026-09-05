/**
 * BoardGenreChip — the board header's genre control (PRD § 7.4).
 *
 * The chip shows `board.genre` and opens the setup flow's genre grid as a
 * popover. It writes the same field the flow's step 2 writes, through the same
 * `setSetup` action, so a genre picked here reaches the Director prompt by the
 * one path (criterion 3). Nothing renders: the genre is a word on the
 * document.
 */

import React, { memo, useCallback, useMemo, useState } from "react";

import {
  Chip,
  FlexColumn,
  Popover,
  SPACING,
  Text
} from "../ui_primitives";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { OptionCardGrid, type OptionCardItem } from "../setup/OptionCardGrid";
import {
  STORYBOARD_GENRES,
  genreByLabel,
  genreStill,
  type StoryboardGenre
} from "../setup/storyboard/genres";

export interface BoardGenreChipProps {
  boardId: string;
  /** The board's stored genre label, empty until one is picked. */
  genre: string;
  /** A read-only board shows the genre without offering the grid. */
  readOnly?: boolean;
}

const toOption = (item: StoryboardGenre): OptionCardItem => ({
  id: item.id,
  title: item.label,
  description: item.description,
  image: genreStill(item)
});

const BoardGenreChipInner: React.FC<BoardGenreChipProps> = ({
  boardId,
  genre,
  readOnly
}) => {
  const setSetup = useStoryboardStore((state) => state.setSetup);
  // The anchor is state, not a ref: the popover needs the element on the
  // render that opens it, and a ref read during render is not that.
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const close = useCallback(() => setAnchorEl(null), []);
  const openGrid = useCallback(
    (event: React.MouseEvent<HTMLElement>) =>
      setAnchorEl((current) => (current ? null : event.currentTarget)),
    []
  );

  const options = useMemo(() => STORYBOARD_GENRES.map(toOption), []);
  const selectedId = genreByLabel(genre)?.id ?? null;

  const handleSelect = useCallback(
    (id: string) => {
      const picked = STORYBOARD_GENRES.find((item) => item.id === id);
      if (picked) {
        setSetup(boardId, { genre: picked.label });
      }
      setAnchorEl(null);
    },
    [boardId, setSetup]
  );

  if (readOnly) {
    return genre ? <Chip compact label={genre} /> : null;
  }

  return (
    <>
      <Chip
        compact
        active={!!genre}
        label={genre || "Set genre"}
        onClick={openGrid}
        aria-haspopup="dialog"
        aria-expanded={anchorEl !== null}
      />
      <Popover
        open={anchorEl !== null}
        anchorEl={anchorEl}
        onClose={close}
        placement="bottom-left"
        maxWidth={720}
        maxHeight="70vh"
      >
        <FlexColumn gap={SPACING.md} sx={{ p: SPACING.xl }}>
          <Text size="small" component="h3">
            Genre
          </Text>
          <OptionCardGrid
            label="Genre"
            options={options}
            selectedId={selectedId}
            onSelect={handleSelect}
            minColumnWidth={160}
          />
        </FlexColumn>
      </Popover>
    </>
  );
};

export const BoardGenreChip = memo(BoardGenreChipInner);
BoardGenreChip.displayName = "BoardGenreChip";

export default BoardGenreChip;
