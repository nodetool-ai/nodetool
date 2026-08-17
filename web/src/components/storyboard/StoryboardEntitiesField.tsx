/**
 * StoryboardEntitiesField — the board's cast & ingredients: which library
 * entities (characters, locations, styles, props) season every shot prompt.
 * Selected entities render as avatar chips; "Add" opens a picker over the
 * entity library. Styles and locations apply to every shot; characters and
 * props activate on the shots that mention them by name (with a per-shot
 * override on each card).
 */

import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import type { Entity } from "@nodetool-ai/protocol";

import {
  Box,
  Caption,
  Chip,
  EditorButton,
  FlexColumn,
  FlexRow,
  MenuItemPrimitive,
  Popover,
  Text,
  BORDER_RADIUS
} from "../ui_primitives";
import { useEntities } from "../../serverState/useEntities";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { ENTITY_KIND_COLOR, ENTITY_KIND_ICON } from "../entities/entityKind";
import { useResolvedMediaUri } from "../../hooks/useResolvedMediaUri";

interface StoryboardEntitiesFieldProps {
  boardId: string;
  entityIds: string[];
}

/** Round reference-image avatar with the kind icon as its empty state. */
const EntityAvatar: React.FC<{ entity: Entity; size?: number }> = ({
  entity,
  size = 20
}) => {
  // A reference image is an `asset://` locator by construction — it needs the
  // asset's own `get_url` before an <img> can load it.
  const thumb = useResolvedMediaUri(entity.reference_images?.[0]);
  const Icon = ENTITY_KIND_ICON[entity.kind];
  const frameSx = {
    width: size,
    height: size,
    borderRadius: BORDER_RADIUS.circle,
    flex: "0 0 auto",
    overflow: "hidden"
  } as const;
  return thumb ? (
    <Box
      component="img"
      src={thumb}
      alt=""
      sx={{ ...frameSx, objectFit: "cover" }}
    />
  ) : (
    <FlexRow
      align="center"
      justify="center"
      sx={{ ...frameSx, fontSize: size }}
    >
      <Icon sx={{ fontSize: "0.7em" }} />
    </FlexRow>
  );
};

const StoryboardEntitiesFieldInner: React.FC<StoryboardEntitiesFieldProps> = ({
  boardId,
  entityIds
}) => {
  const { data: allEntities } = useEntities();
  const setEntityIds = useStoryboardStore((state) => state.setEntityIds);
  const [pickerOpen, setPickerOpen] = useState(false);
  const addButtonRef = useRef<HTMLButtonElement | null>(null);

  const { selected, available } = useMemo(() => {
    const entities = allEntities ?? [];
    const idSet = new Set(entityIds);
    const byId = new Map(entities.map((e) => [e.id, e]));
    return {
      selected: entityIds
        .map((id) => byId.get(id))
        .filter((e): e is Entity => !!e),
      available: entities.filter((e) => !idSet.has(e.id))
    };
  }, [allEntities, entityIds]);

  const handleRemove = useCallback(
    (id: string) =>
      setEntityIds(
        boardId,
        entityIds.filter((existing) => existing !== id)
      ),
    [setEntityIds, boardId, entityIds]
  );

  const handleAdd = useCallback(
    (id: string) => {
      setEntityIds(boardId, [...entityIds, id]);
      setPickerOpen(false);
    },
    [setEntityIds, boardId, entityIds]
  );

  return (
    <FlexRow gap={1} align="center" wrap className="storyboard-entities">
      {selected.map((entity) => (
        <Chip
          key={entity.id}
          label={entity.name || "Untitled"}
          color={ENTITY_KIND_COLOR[entity.kind]}
          variant="outlined"
          icon={<EntityAvatar entity={entity} />}
          title={entity.descriptor || entity.name}
          onDelete={() => handleRemove(entity.id)}
        />
      ))}
      <EditorButton
        ref={addButtonRef}
        variant="outlined"
        startIcon={<AddIcon />}
        onClick={() => setPickerOpen(true)}
      >
        {selected.length === 0 ? "Add entities" : "Add"}
      </EditorButton>

      <Popover
        open={pickerOpen}
        anchorEl={addButtonRef.current}
        onClose={() => setPickerOpen(false)}
        placement="bottom-left"
        maxHeight={320}
        maxWidth={360}
      >
        {available.length === 0 ? (
          <FlexColumn gap={1} sx={{ p: 2, maxWidth: 280 }}>
            <Text size="small">
              {(allEntities ?? []).length === 0
                ? "No entities yet."
                : "All entities are already on this board."}
            </Text>
            {(allEntities ?? []).length === 0 && (
              <Caption color="secondary">
                Tag an image as a character, location, style, or prop in the
                Entities library, then add it here for consistent shots.
              </Caption>
            )}
          </FlexColumn>
        ) : (
          available.map((entity) => (
            <MenuItemPrimitive
              key={entity.id}
              label={entity.name || "Untitled"}
              secondary={`${entity.kind}${
                entity.descriptor ? ` · ${entity.descriptor}` : ""
              }`}
              icon={<EntityAvatar entity={entity} size={24} />}
              onClick={() => handleAdd(entity.id)}
            />
          ))
        )}
      </Popover>
    </FlexRow>
  );
};

export const StoryboardEntitiesField = memo(StoryboardEntitiesFieldInner);
StoryboardEntitiesField.displayName = "StoryboardEntitiesField";

export default StoryboardEntitiesField;
