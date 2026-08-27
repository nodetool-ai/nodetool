/**
 * EntityLibrary — the ingredients page: a grid of reusable entities with an
 * "Add entity" flow (pick an image asset, then tag it) plus edit / remove. A
 * standalone page surface opened as a workspace tab.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import type { Entity } from "@nodetool-ai/protocol";
import {
  Text,
  Caption,
  EmptyState,
  LoadingSpinner,
  FlexRow,
  FlexColumn,
  EditorButton,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import {
  useEntities,
  useDeleteEntity
} from "../../serverState/useEntities";
import EntityAssetPickerDialog from "./EntityAssetPickerDialog";
import EntityCard from "./EntityCard";
import EntityEditorDialog from "./EntityEditorDialog";

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
  gap: getSpacingPx(SPACING.md),
  width: "100%"
};

const EntityLibraryInternal: React.FC = () => {
  const { data: entities, isLoading } = useEntities();
  const deleteEntity = useDeleteEntity();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorAssetId, setEditorAssetId] = useState<string | null>(null);
  const [editingEntity, setEditingEntity] = useState<Entity | undefined>(
    undefined
  );

  const handleAdd = useCallback(() => setPickerOpen(true), []);

  const handlePick = useCallback((assetId: string) => {
    setPickerOpen(false);
    setEditorAssetId(assetId);
    setEditingEntity(undefined);
    setEditorOpen(true);
  }, []);

  const handleEdit = useCallback((entity: Entity) => {
    setEditorAssetId(entity.id);
    setEditingEntity(entity);
    setEditorOpen(true);
  }, []);

  const handleRemove = useCallback(
    (entity: Entity) => {
      deleteEntity.mutate(entity.id);
    },
    [deleteEntity]
  );

  const content = useMemo(() => {
    if (isLoading) {
      return (
        <FlexRow align="center" justify="center" sx={{ p: 4 }}>
          <LoadingSpinner />
        </FlexRow>
      );
    }
    if (!entities || entities.length === 0) {
      return (
        <EmptyState
          variant="empty"
          title="No entities yet"
          description="Tag an image as a character, location, style, or prop to reuse it across shots."
          actionText="Add entity"
          onAction={handleAdd}
        />
      );
    }
    return (
      <div style={gridStyle}>
        {entities.map((entity) => (
          <EntityCard
            key={entity.id}
            entity={entity}
            onEdit={handleEdit}
            onRemove={handleRemove}
          />
        ))}
      </div>
    );
  }, [isLoading, entities, handleAdd, handleEdit, handleRemove]);

  return (
    <FlexColumn gap={SPACING.md} sx={{ p: 2, width: "100%" }}>
      <FlexRow align="center" justify="space-between">
        <FlexColumn gap={0}>
          <Text size="big">Entities</Text>
          <Caption>Reusable characters, locations, styles, and props</Caption>
        </FlexColumn>
        <EditorButton
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAdd}
        >
          Add entity
        </EditorButton>
      </FlexRow>

      {content}

      <EntityAssetPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={handlePick}
      />

      {editorAssetId && (
        <EntityEditorDialog
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          assetId={editorAssetId}
          entity={editingEntity}
        />
      )}
    </FlexColumn>
  );
};

export const EntityLibrary = memo(EntityLibraryInternal);
export default EntityLibrary;
