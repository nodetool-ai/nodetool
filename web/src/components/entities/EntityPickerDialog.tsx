/**
 * EntityPickerDialog — {@link EntityPicker} in a dialog.
 *
 * Single mode hands over the clicked entity and closes. Multiple mode toggles
 * entities in and out of `selectedIds` through `onSelect` and stays open until
 * Done, so several can be picked in one visit.
 */
import React, { memo } from "react";
import type { Entity } from "@nodetool-ai/protocol";

import EntityPicker from "./EntityPicker";
import { Dialog } from "../ui_primitives";

export interface EntityPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (entity: Entity) => void;
  title?: string;
  /** Keep the dialog open across picks and show a Done button. */
  multiple?: boolean;
  selectedIds?: readonly string[];
  /** Offer only these entities. Defaults to the active project's library. */
  entities?: readonly Entity[];
}

const EntityPickerDialogInternal: React.FC<EntityPickerDialogProps> = ({
  open,
  onClose,
  onSelect,
  title = "Pick an entity",
  multiple = false,
  selectedIds,
  entities
}) => {
  const handleSelect = (entity: Entity) => {
    onSelect(entity);
    if (!multiple) {
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      maxWidth="md"
      fullWidth
      onConfirm={multiple ? onClose : undefined}
      confirmText="Done"
    >
      <EntityPicker
        onSelect={handleSelect}
        selectedIds={selectedIds}
        entities={entities}
        height="55vh"
        autoFocus
      />
    </Dialog>
  );
};

export const EntityPickerDialog = memo(EntityPickerDialogInternal);
export default EntityPickerDialog;
