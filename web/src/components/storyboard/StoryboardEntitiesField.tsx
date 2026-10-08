/**
 * StoryboardEntitiesField — the board's cast & ingredients: which library
 * entities (characters, locations, styles, props) season every shot prompt.
 * They show as the same reference-image tiles as a shot's entities. Styles
 * and locations apply to every shot; characters and props activate on the
 * shots that mention them by name (with a per-shot override in the shot
 * editor). A pick in the library adds the entity to the board, or takes it
 * off when it is already there.
 */

import React, { memo, useCallback, useMemo } from "react";
import type { Entity } from "@nodetool-ai/protocol";

import { useEntities } from "../../serverState/useEntities";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import EntityTilesField from "./EntityTilesField";

interface StoryboardEntitiesFieldProps {
  boardId: string;
  entityIds: string[];
  readOnly?: boolean;
}

const removeLabel = (name: string): string => `Remove ${name} from the board`;

const StoryboardEntitiesFieldInner: React.FC<StoryboardEntitiesFieldProps> = ({
  boardId,
  entityIds,
  readOnly
}) => {
  const { data: allEntities } = useEntities();
  const setEntityIds = useStoryboardStore((state) => state.setEntityIds);

  const selected = useMemo(() => {
    const byId = new Map((allEntities ?? []).map((e) => [e.id, e]));
    return entityIds
      .map((id) => byId.get(id))
      .filter((e): e is Entity => !!e);
  }, [allEntities, entityIds]);

  const handleRemove = useCallback(
    (entity: Entity) =>
      setEntityIds(
        boardId,
        entityIds.filter((existing) => existing !== entity.id)
      ),
    [setEntityIds, boardId, entityIds]
  );

  const handlePick = useCallback(
    (entity: Entity) =>
      setEntityIds(
        boardId,
        entityIds.includes(entity.id)
          ? entityIds.filter((existing) => existing !== entity.id)
          : [...entityIds, entity.id]
      ),
    [setEntityIds, boardId, entityIds]
  );

  return (
    <EntityTilesField
      data-testid="storyboard-entities"
      entities={selected}
      selectedIds={entityIds}
      onPick={handlePick}
      onRemove={handleRemove}
      removeLabel={removeLabel}
      emptyText="No entities yet. Choose a character, location, style or prop to keep it consistent across shots."
      readOnly={readOnly}
    />
  );
};

export const StoryboardEntitiesField = memo(StoryboardEntitiesFieldInner);
StoryboardEntitiesField.displayName = "StoryboardEntitiesField";

export default StoryboardEntitiesField;
