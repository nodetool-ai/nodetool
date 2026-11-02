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
import { useTranslation } from "react-i18next";

import {
  Caption,
  Dialog,
  FlexColumn,
  PresetPicker,
  Label,
  SPACING
} from "../ui_primitives";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { useEntities } from "../../serverState/useEntities";
import {
  mergeStylePresetEntities,
  useStylePresets
} from "../../serverState/useStylePresets";
import { LOOK_PRESETS } from "../../lib/presets/catalog";
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
  const { t } = useTranslation();
  const lookIds = useStoryboardStore(
    (state) => state.boards[boardId]?.look_preset_ids
  );
  const setLookPresetIds = useStoryboardStore(
    (state) => state.setLookPresetIds
  );
  const setStylePreset = useStoryboardStore((state) => state.setStylePreset);
  const entityIds = useStoryboardStore(
    useCallback(
      (state) => state.boards[boardId]?.entityIds ?? EMPTY_IDS,
      [boardId]
    )
  );
  const { data: presets } = useStylePresets();
  const { data: projectEntities } = useEntities();
  const entities = useMemo(
    () => mergeStylePresetEntities(projectEntities, presets),
    [projectEntities, presets]
  );

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
      entities.filter((e) => e.kind === "style").map((e) => e.id)
    );
    return [...entityIds].reverse().find((id) => styleIds.has(id)) ?? null;
  }, [entities, entityIds]);

  const handleSelect = useCallback(
    (entityId: string) => {
      setStylePreset(boardId, entityId, entities);
      onClose();
    },
    [boardId, entities, setStylePreset, onClose]
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("screens4_12.boardStyleDialog.title")}
      maxWidth="md"
    >
      <FlexColumn gap={SPACING.lg} sx={{ pt: SPACING.md }}>
        <Caption color="secondary">
          {t("screens4_12.boardStyleDialog.description")}
        </Caption>
        <Label>{t("screens4_12.boardStyleDialog.artStyle")}</Label>
        <PresetTileGrid
          label={t("screens4_12.boardStyleDialog.artStyle")}
          presets={tiles}
          selectedId={selectedId}
          onSelect={handleSelect}
          onAddOwn={noop}
          addOwnLabel={t("screens4_12.boardStyleDialog.addOwnStyle")}
          addOwnDisabled
          addOwnDisabledReason={t(
            "screens4_12.boardStyleDialog.addOwnDisabledReason"
          )}
        />
        <Label>{t("look_preset_field.board")}</Label>
        <PresetPicker
          presets={LOOK_PRESETS}
          value={lookIds ?? []}
          onChange={(ids) => setLookPresetIds(boardId, ids)}
          filter={{ kind: "look" }}
        />
      </FlexColumn>
    </Dialog>
  );
};

export const BoardStyleDialog = memo(BoardStyleDialogInner);
BoardStyleDialog.displayName = "BoardStyleDialog";

export default BoardStyleDialog;
