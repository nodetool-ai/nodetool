/**
 * BoardStyleDialog — `Change Style` on the board toolbar (PRD § 7.4).
 *
 * The same preset grid the setup flow's look step shows, as a dialog. Picking
 * a tile is one `setStylePreset` call and nothing else: D12 — a style change
 * never renders. Existing stills and clips go stale through their render
 * record (§ 7.7.4) and are re-rendered from the toolbar, deliberately, by the
 * creator.
 *
 * The descriptors come from the entity library rather than from the tile, so a
 * preset means the same thing here, in the setup flow, and to the agent.
 */

import React, { memo, useCallback, useMemo } from "react";

import {
  Caption,
  Dialog,
  FlexColumn,
  SPACING
} from "../ui_primitives";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useEntities } from "../../serverState/useEntities";
import { useStylePresets } from "../../serverState/useStylePresets";
import { PresetTileGrid, type PresetTile } from "../setup/PresetTileGrid";

export interface BoardStyleDialogProps {
  boardId: string;
  open: boolean;
  onClose: () => void;
}

const noop = () => undefined;

/** Stable empty result, so the selector never hands React a fresh array. */
const EMPTY_IDS: readonly string[] = [];

const BoardStyleDialogInner: React.FC<BoardStyleDialogProps> = ({
  boardId,
  open,
  onClose
}) => {
  const setStylePreset = useStoryboardStore((state) => state.setStylePreset);
  const entityIds = useStoryboardStore(
    useCallback(
      (state) => state.boards[boardId]?.entityIds ?? EMPTY_IDS,
      [boardId]
    )
  );
  const { data: presets } = useStylePresets();
  const { data: entities } = useEntities();

  const tiles = useMemo<PresetTile[]>(
    () =>
      (presets ?? []).map((preset) => ({
        id: preset.entityId,
        title: preset.name,
        image: preset.thumbnail
      })),
    [presets]
  );

  // The board's style is whichever style entity it carries; the last one wins,
  // which is the one `setStylePreset` appended.
  const selectedId = useMemo(() => {
    const styleIds = new Set(
      (entities ?? []).filter((e) => e.kind === "style").map((e) => e.id)
    );
    return [...entityIds].reverse().find((id) => styleIds.has(id)) ?? null;
  }, [entities, entityIds]);

  const handleSelect = useCallback(
    (entityId: string) => {
      setStylePreset(boardId, entityId, entities ?? []);
      onClose();
    },
    [boardId, entities, setStylePreset, onClose]
  );

  return (
    <Dialog open={open} onClose={onClose} title="Change style" maxWidth="md">
      <FlexColumn gap={SPACING.lg} sx={{ pt: SPACING.md }}>
        <Caption color="secondary">
          The new style applies to every shot. Stills and clips already
          rendered are marked stale — nothing re-renders until you ask for it.
        </Caption>
        <PresetTileGrid
          label="Art style"
          presets={tiles}
          selectedId={selectedId}
          onSelect={handleSelect}
          onAddOwn={noop}
          addOwnLabel="Add your own style"
          addOwnDisabled
          addOwnDisabledReason="Custom styles are added while setting up a board."
        />
      </FlexColumn>
    </Dialog>
  );
};

export const BoardStyleDialog = memo(BoardStyleDialogInner);
BoardStyleDialog.displayName = "BoardStyleDialog";

export default BoardStyleDialog;
