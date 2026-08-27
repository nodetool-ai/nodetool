/**
 * MentionedEntities — the entities the current prompt references.
 *
 * A picked entity is written into the textarea as its `entity://<id>` token,
 * which a plain textarea cannot render as a chip. This row is the readable
 * half: it derives the chips from the text itself, so it can never disagree
 * with what will be sent, and deleting a chip removes the token.
 */
import React, { useCallback, useMemo } from "react";

import { Chip, FlexRow, SPACING } from "../../ui_primitives";
import {
  ENTITY_KIND_ICON,
  getEntityKindChipSx
} from "../../entities/entityKind";
import { useEntities } from "../../../serverState/useEntities";
import {
  entityIdsInPrompt,
  removeEntityMentions
} from "../../node_types/editing/promptComposer/promptTokens";

interface MentionedEntitiesProps {
  /** The composer's current text. */
  value: string;
  /** Replace the composer's text (used to drop a removed entity's tokens). */
  setValue: (next: string) => void;
}

const MentionedEntityChip: React.FC<{
  id: string;
  name: string;
  kind: keyof typeof ENTITY_KIND_ICON;
  descriptor: string;
  onRemove: (id: string) => void;
}> = ({ id, name, kind, descriptor, onRemove }) => {
  const Icon = ENTITY_KIND_ICON[kind];
  const handleDelete = useCallback(() => onRemove(id), [id, onRemove]);
  return (
    <Chip
      compact
      variant="outlined"
      icon={<Icon />}
      label={name}
      title={descriptor || `${name} · ${kind}`}
      onDelete={handleDelete}
      sx={getEntityKindChipSx(kind)}
    />
  );
};

export const MentionedEntities: React.FC<MentionedEntitiesProps> = ({
  value,
  setValue
}) => {
  const { data: entities } = useEntities();

  // An id with no entity behind it (deleted, or another user's) is dropped
  // rather than shown as an unnamed chip — the server drops the token too.
  const mentioned = useMemo(() => {
    const ids = entityIdsInPrompt(value);
    if (ids.length === 0 || !entities) {
      return [];
    }
    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    return ids.flatMap((id) => {
      const entity = byId.get(id);
      return entity ? [entity] : [];
    });
  }, [value, entities]);

  const handleRemove = useCallback(
    (id: string) => setValue(removeEntityMentions(value, id)),
    [value, setValue]
  );

  if (mentioned.length === 0) {
    return null;
  }

  return (
    <FlexRow
      gap={SPACING.xs}
      wrap
      align="center"
      className="mentioned-entities"
      data-testid="mentioned-entities"
    >
      {mentioned.map((entity) => (
        <MentionedEntityChip
          key={entity.id}
          id={entity.id}
          name={entity.name}
          kind={entity.kind}
          descriptor={entity.descriptor}
          onRemove={handleRemove}
        />
      ))}
    </FlexRow>
  );
};

export default MentionedEntities;
