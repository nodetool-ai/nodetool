/**
 * ShotEntitiesField — the entities a shot renders with, as reference-image
 * tiles. A pick in the library toggles the entity on the shot, and an entity
 * the board does not carry yet joins the board first.
 */

import React, { memo, useCallback, useMemo } from "react";
import type { Entity } from "@nodetool-ai/protocol";

import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import EntityTilesField from "./EntityTilesField";
import { CreateEntityButton } from "../entities/EntityListPanel";

interface ShotEntitiesFieldProps {
  boardId: string;
  shotId: string;
  /** The board's entities, in board order. */
  boardEntities: readonly Entity[];
  /** The entities this shot renders with. */
  appliedIds: string[];
  boardEntityIds: readonly string[];
  readOnly?: boolean;
}

const removeLabel = (name: string): string => `Remove ${name} from this shot`;

const ShotEntitiesFieldInner: React.FC<ShotEntitiesFieldProps> = ({
  boardId,
  shotId,
  boardEntities,
  appliedIds,
  boardEntityIds,
  readOnly
}) => {
  const toggleShotEntity = useStoryboardStore(
    (state) => state.toggleShotEntity
  );
  const setEntityIds = useStoryboardStore((state) => state.setEntityIds);

  const applied = useMemo(
    () => boardEntities.filter((entity) => appliedIds.includes(entity.id)),
    [boardEntities, appliedIds]
  );

  const handleRemove = useCallback(
    (entity: Entity) =>
      toggleShotEntity(boardId, shotId, entity.id, appliedIds),
    [toggleShotEntity, boardId, shotId, appliedIds]
  );

  const handlePick = useCallback(
    (entity: Entity) => {
      if (!boardEntityIds.includes(entity.id)) {
        setEntityIds(boardId, [...boardEntityIds, entity.id]);
      }
      toggleShotEntity(boardId, shotId, entity.id, appliedIds);
    },
    [boardEntityIds, setEntityIds, toggleShotEntity, boardId, shotId, appliedIds]
  );

  return (
    <EntityTilesField
      data-testid="shot-entities"
      label="In this shot"
      entities={applied}
      selectedIds={appliedIds}
      onPick={handlePick}
      onRemove={handleRemove}
      removeLabel={removeLabel}
      emptyText="No entities. Choose a character, location, style or prop to keep it consistent in this shot."
      readOnly={readOnly}
      // A new entity joins the board and this shot, as a picked one does.
      extraAction={
        <CreateEntityButton label="New entity" onCreated={handlePick} />
      }
    />
  );
};

export const ShotEntitiesField = memo(ShotEntitiesFieldInner);
ShotEntitiesField.displayName = "ShotEntitiesField";

export default ShotEntitiesField;
