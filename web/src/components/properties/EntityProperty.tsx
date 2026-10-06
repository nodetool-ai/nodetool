import { memo, useCallback, useMemo, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import type { Entity } from "@nodetool-ai/protocol";

import isEqual from "../../utils/isEqual";
import PropertyLabel from "../node/PropertyLabel";
import type { PropertyProps } from "../node/PropertyInput.types";
import EntityPickerDialog from "../entities/EntityPickerDialog";
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

/**
 * Pick entities from the library for an `entity` or `list[entity]` property.
 *
 * The picker writes the whole Entity object, but only the id is identity: the
 * rest is a cache the runtime refreshes from the library.
 */
const EntityProperty = (props: PropertyProps<Entity | Entity[] | null>) => {
  const { property, value, onChange, propertyIndex } = props;
  const multiple = property.type?.type === "list";
  const id = `entity-${property.name}-${propertyIndex}`;
  const [pickerOpen, setPickerOpen] = useState(false);

  const selected: Entity[] = useMemo(() => {
    if (Array.isArray(value)) {
      return value;
    }
    return value ? [value] : [];
  }, [value]);

  const handlePick = useCallback(
    (picked: Entity) => {
      if (!multiple) {
        onChange(picked);
        return;
      }
      if (selected.some((entity) => entity.id === picked.id)) {
        return;
      }
      onChange([...selected, picked]);
    },
    [multiple, onChange, selected]
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
      <EntityPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handlePick}
        title={addLabel}
      />
    </>
  );
};

export default memo(EntityProperty, isEqual);
