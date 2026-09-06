import { memo, useCallback, useMemo, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import type { Entity } from "@nodetool-ai/protocol";

import isEqual from "../../utils/isEqual";
import PropertyLabel from "../node/PropertyLabel";
import type { PropertyProps } from "../node/PropertyInput.types";
import { useEntities } from "../../serverState/useEntities";
import EntityAssetPickerDialog from "../entities/EntityAssetPickerDialog";
import {
  getEntityChipSx,
  getEntityKindDotSx
} from "../entities/entityKind";
import {
  Box,
  Chip,
  EditorButton,
  FlexRow,
  SPACING
} from "../ui_primitives";

const EMPTY_DESCRIPTION =
  "Tag an image as a character, location, style or prop in the entity library first.";

/**
 * Pick entities from the library for an `entity` or `list[entity]` property.
 *
 * An entity's id is its asset id, so the library picker is the asset picker
 * narrowed to the assets that carry an entity marker. Only the id is identity:
 * the rest of the object is a cache the runtime refreshes from the library.
 */
const EntityProperty = (props: PropertyProps<Entity | Entity[] | null>) => {
  const { property, value, onChange, propertyIndex } = props;
  const multiple = property.type?.type === "list";
  const id = `entity-${property.name}-${propertyIndex}`;
  const [pickerOpen, setPickerOpen] = useState(false);
  const { data: entities } = useEntities();

  const selected: Entity[] = useMemo(() => {
    if (Array.isArray(value)) {
      return value;
    }
    return value ? [value] : [];
  }, [value]);

  const selectableIds = useMemo(
    () => (entities ?? []).map((entity) => entity.id),
    [entities]
  );

  const handlePick = useCallback(
    (assetId: string) => {
      setPickerOpen(false);
      const picked = (entities ?? []).find((entity) => entity.id === assetId);
      if (!picked) {
        return;
      }
      if (!multiple) {
        onChange(picked);
        return;
      }
      if (selected.some((entity) => entity.id === picked.id)) {
        return;
      }
      onChange([...selected, picked]);
    },
    [entities, multiple, onChange, selected]
  );

  const handleRemove = useCallback(
    (entityId: string) => {
      if (!multiple) {
        onChange(null);
        return;
      }
      onChange(selected.filter((entity) => entity.id !== entityId));
    },
    [multiple, onChange, selected]
  );

  const addLabel = multiple ? "Add entity" : "Pick entity";

  return (
    <>
      <PropertyLabel
        name={property.name}
        description={property.description}
        id={id}
      />
      <FlexRow gap={SPACING.micro} align="center" wrap>
        {selected.map((entity) => (
          <Chip
            key={entity.id}
            compact
            variant="outlined"
            label={entity.name || "Untitled"}
            icon={<Box sx={getEntityKindDotSx(entity.kind, true)} />}
            sx={getEntityChipSx(true)}
            onDelete={() => handleRemove(entity.id)}
          />
        ))}
        <EditorButton
          density="compact"
          startIcon={<AddIcon fontSize="inherit" />}
          onClick={() => setPickerOpen(true)}
        >
          {addLabel}
        </EditorButton>
      </FlexRow>
      <EntityAssetPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={handlePick}
        title={addLabel}
        assetIds={selectableIds}
        emptyTitle="No entities"
        emptyDescription={EMPTY_DESCRIPTION}
      />
    </>
  );
};

export default memo(EntityProperty, isEqual);
