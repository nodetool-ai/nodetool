/**
 * The entities a project holds, under its documents.
 *
 * An entity is a tagged image asset, not a document row, so there is no tab to
 * open: the cards edit and remove in place, exactly as the library page and the
 * left panel do. The rows come from `projects.get`, which a `resource_change`
 * on any asset invalidates — an entity the agent tags inside this project shows
 * up here without anything polling.
 */

import { memo, useCallback, useState } from "react";
import type { Entity } from "@nodetool-ai/protocol";
import type { ProjectEntitySummary } from "@nodetool-ai/protocol/api-schemas/projects.js";

import { useDeleteEntity } from "../../serverState/useEntities";
import EntityAssetPickerDialog from "../entities/EntityAssetPickerDialog";
import EntityCard from "../entities/EntityCard";
import EntityEditorDialog from "../entities/EntityEditorDialog";
import {
  AutoGrid,
  Box,
  Caption,
  EditorButton,
  FlexRow,
  SPACING
} from "../ui_primitives";

interface ProjectEntitiesSectionProps {
  projectId: string;
  entities: ProjectEntitySummary[];
}

/**
 * The summary rows carry the whole marker, and an entity's reference image is
 * its own asset, so a card renders and an editor prefills from one row with no
 * second fetch.
 */
const toEntity = (row: ProjectEntitySummary): Entity => ({
  type: "entity",
  id: row.id,
  kind: row.kind,
  name: row.name,
  descriptor: row.descriptor,
  description: row.description,
  voice_id: row.voice_id ?? null,
  tags: row.tags,
  lora: row.lora ?? null,
  palette: row.palette ?? null,
  reference_images: [
    { type: "image", asset_id: row.id, uri: `asset://${row.id}` }
  ],
  updated_at: row.updatedAt
});

const ProjectEntitiesSectionInternal = ({
  projectId,
  entities
}: ProjectEntitiesSectionProps) => {
  const deleteEntity = useDeleteEntity();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editorAssetId, setEditorAssetId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Entity | undefined>(undefined);

  const handleAdd = useCallback(() => setPickerOpen(true), []);

  const handlePick = useCallback((assetId: string) => {
    setPickerOpen(false);
    setEditing(undefined);
    setEditorAssetId(assetId);
  }, []);

  const handleEdit = useCallback((entity: Entity) => {
    setEditing(entity);
    setEditorAssetId(entity.id);
  }, []);

  const handleRemove = useCallback(
    (entity: Entity) => deleteEntity.mutate(entity.id),
    [deleteEntity]
  );

  const closeEditor = useCallback(() => setEditorAssetId(null), []);

  return (
    <>
      <FlexRow
        align="baseline"
        gap={SPACING.md}
        sx={{ pt: SPACING.xl, pb: SPACING.md }}
      >
        <Caption color="muted" sx={{ textTransform: "uppercase" }}>
          Entities
        </Caption>
        <Box sx={{ flex: 1 }} />
        <EditorButton variant="text" density="compact" onClick={handleAdd}>
          Add entity
        </EditorButton>
      </FlexRow>

      {entities.length === 0 ? (
        <Caption color="muted">
          No entities in this project. Tag an image as a character, location,
          style, or prop to hold it steady across shots.
        </Caption>
      ) : (
        <AutoGrid minItemWidth={180} gap={SPACING.lg}>
          {entities.map((row) => (
            <EntityCard
              key={row.id}
              entity={toEntity(row)}
              onEdit={handleEdit}
              onRemove={handleRemove}
            />
          ))}
        </AutoGrid>
      )}

      <EntityAssetPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={handlePick}
      />

      {editorAssetId && (
        <EntityEditorDialog
          open
          onClose={closeEditor}
          assetId={editorAssetId}
          entity={editing}
          projectId={projectId}
        />
      )}
    </>
  );
};

export const ProjectEntitiesSection = memo(ProjectEntitiesSectionInternal);
export default ProjectEntitiesSection;
