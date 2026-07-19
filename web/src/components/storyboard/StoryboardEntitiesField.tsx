/**
 * StoryboardEntitiesField — the board's cast & ingredients: which library
 * entities (characters, locations, styles, props) season every shot prompt.
 * Selected entities render as avatar chips; "Add" opens a picker over the
 * entity library. Styles and locations apply to every shot; characters and
 * props activate on the shots that mention them by name (with a per-shot
 * override on each card).
 */

import React, { memo, useCallback, useRef, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import type { Entity } from "@nodetool-ai/protocol";

import {
  Caption,
  Chip,
  EditorButton,
  FlexColumn,
  FlexRow,
  MenuItemPrimitive,
  Popover,
  Text
} from "../ui_primitives";
import { useEntities } from "../../serverState/useEntities";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { ENTITY_KIND_COLOR, ENTITY_KIND_ICON } from "../entities/entityKind";

export interface StoryboardEntitiesFieldProps {
  boardId: string;
  entityIds: string[];
}

const entityThumb = (entity: Entity): string | undefined =>
  entity.reference_images?.[0]?.uri;

/** Round reference-image avatar with the kind icon as its empty state. */
const EntityAvatar: React.FC<{ entity: Entity; size?: number }> = ({
  entity,
  size = 20
}) => {
  const thumb = entityThumb(entity);
  const Icon = ENTITY_KIND_ICON[entity.kind];
  const frame: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    flex: "0 0 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  };
  return thumb ? (
    <img src={thumb} alt="" style={{ ...frame, objectFit: "cover" }} />
  ) : (
    <span style={frame}>
      <Icon sx={{ fontSize: size * 0.7 }} />
    </span>
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

  const byId = new Map((allEntities ?? []).map((e) => [e.id, e]));
  const selected = entityIds
    .map((id) => byId.get(id))
    .filter((e): e is Entity => !!e);
  const available = (allEntities ?? []).filter(
    (e) => !entityIds.includes(e.id)
  );

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
