/**
 * EntityListPanel — the entity library as a left-panel view, next to
 * storyboards. Entities are tagged image assets rather than documents, so the
 * panel shows the same cards the page does (edit / remove in place) instead of
 * opening a workspace tab per row.
 */

import AddIcon from "@mui/icons-material/Add";
import React, { memo, useCallback, useState } from "react";
import type { Entity } from "@nodetool-ai/protocol";

import { useDeleteEntity, useEntities } from "../../serverState/useEntities";
import {
  AutoGrid,
  EmptyState,
  FlexRow,
  LoadingSpinner,
  ScrollArea,
  SPACING,
  ToolbarIconButton,
  Tooltip,
  getSpacingPx
} from "../ui_primitives";
import EntityAssetPickerDialog from "./EntityAssetPickerDialog";
import EntityCard from "./EntityCard";
import EntityEditorDialog from "./EntityEditorDialog";
import { creationProjectId } from "../../stores/WorkspaceTabsStore";

/** Picks an image asset, then opens the editor to describe it. */
interface CreateEntityButtonProps {
  readonly projectId?: string;
}

export const CreateEntityButton = memo(function CreateEntityButton({
  projectId
}: CreateEntityButtonProps) {
  const scopedProjectId = projectId ?? creationProjectId();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [assetId, setAssetId] = useState<string | null>(null);

  const handlePick = useCallback((picked: string) => {
    setPickerOpen(false);
    setAssetId(picked);
  }, []);

  return (
    <>
      <Tooltip title="New entity" placement="right-start">
        <ToolbarIconButton
          ariaLabel="New entity"
          onClick={() => setPickerOpen(true)}
          tabIndex={-1}
          icon={<AddIcon />}
        />
      </Tooltip>
      <EntityAssetPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={handlePick}
        projectId={scopedProjectId}
      />
      {assetId && (
        <EntityEditorDialog
          open
          onClose={() => setAssetId(null)}
          assetId={assetId}
          projectId={scopedProjectId}
        />
      )}
    </>
  );
});

interface EntityListPanelProps {
  readonly projectId: string;
}

const EntityListPanelInternal: React.FC<EntityListPanelProps> = ({
  projectId
}) => {
  const { data: entities, isLoading } = useEntities(projectId);
  const deleteEntity = useDeleteEntity();
  const [editing, setEditing] = useState<Entity | null>(null);

  const handleRemove = useCallback(
    (entity: Entity) => {
      deleteEntity.mutate(entity.id);
    },
    [deleteEntity]
  );

  if (isLoading) {
    return (
      <FlexRow align="center" justify="center" sx={{ p: 3 }}>
        <LoadingSpinner />
      </FlexRow>
    );
  }

  if (!entities || entities.length === 0) {
    return (
      <EmptyState
        variant="empty"
        title="No entities yet"
        description="Tag an image as a character, location, style, or prop with the + button above."
        size="small"
      />
    );
  }

  return (
    <>
      <ScrollArea fullHeight>
        <AutoGrid
          minItemWidth={140}
          gap={SPACING.md}
          sx={{ padding: getSpacingPx(SPACING.md), width: "100%" }}
        >
          {entities.map((entity) => (
            <EntityCard
              key={entity.id}
              entity={entity}
              onEdit={setEditing}
              onRemove={handleRemove}
            />
          ))}
        </AutoGrid>
      </ScrollArea>
      {editing && (
        <EntityEditorDialog
          open
          onClose={() => setEditing(null)}
          assetId={editing.id}
          entity={editing}
          projectId={projectId}
        />
      )}
    </>
  );
};

export const EntityListPanel = memo(EntityListPanelInternal);
export default EntityListPanel;
