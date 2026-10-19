/**
 * EntityLibrary — the ingredients page: a grid of reusable entities with an
 * "Add entity" flow (pick an image asset, then tag it) plus edit / remove. A
 * standalone page surface opened as a workspace tab.
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import AddIcon from "@mui/icons-material/AddOutlined";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import type { Entity } from "@nodetool-ai/protocol";
import {
  Text,
  Caption,
  EmptyState,
  LoadingSpinner,
  FlexRow,
  FlexColumn,
  EditorButton,
  AutoGrid,
  SPACING
} from "../ui_primitives";
import {
  useEntities,
  useDeleteEntity
} from "../../serverState/useEntities";
import EntityCard from "./EntityCard";
import EntityEditorDialog from "./EntityEditorDialog";
import EntitySetupHost from "../setup/entity/EntitySetupHost";
import { clearEntitySetupDraft } from "../setup/entity/entitySetupDraft";
import {
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import { useEntityLibraryStore } from "../../stores/EntityLibraryStore";

const EntityLibraryInternal: React.FC = () => {
  const { t } = useTranslation();
  const projectId =
    useWorkspaceTabsStore((state) => state.activeProjectId) ?? LOOSE_PROJECT_ID;
  const { data: entities, isLoading } = useEntities();
  const deleteEntity = useDeleteEntity();

  const createRequested = useEntityLibraryStore(
    (state) => state.createRequested
  );
  const createAssetId = useEntityLibraryStore((state) => state.createAssetId);
  const clearCreateRequest = useEntityLibraryStore(
    (state) => state.clearCreateRequest
  );
  // One draft per project, so a half-made entity does not follow the creator
  // into another project's library.
  const draftKey = `entity-library:${projectId}`;
  // Local, so the guided flow ends with this page. A request made before the
  // tab opened (or while it is open) starts it once and is then consumed.
  const [creating, setCreating] = useState(createRequested);
  // The image a request preselected as the reference. It replaces any draft,
  // since the creator just chose this image for a new entity.
  const [startAssetId, setStartAssetId] = useState<string | null>(null);
  useEffect(() => {
    if (createRequested) {
      if (createAssetId) {
        clearEntitySetupDraft(draftKey);
      }
      setStartAssetId(createAssetId);
      setCreating(true);
      clearCreateRequest();
    }
  }, [clearCreateRequest, createAssetId, createRequested, draftKey]);
  // The entity save and blank reference upload cannot be stopped, so the
  // exit waits for them rather than leaving a saved entity or orphan asset.
  const [setupBusy, setSetupBusy] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorAssetId, setEditorAssetId] = useState<string | null>(null);
  const [editingEntity, setEditingEntity] = useState<Entity | undefined>(
    undefined
  );

  const handleAdd = useCallback(() => setCreating(true), []);

  // Leaving without creating discards the draft.
  const handleBack = useCallback(() => {
    clearEntitySetupDraft(draftKey);
    setStartAssetId(null);
    setCreating(false);
  }, [draftKey]);

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
        <FlexRow align="center" justify="center" sx={{ p: SPACING.xl }}>
          <LoadingSpinner text={t("screens4_22.entities.loadingEntities")} />
        </FlexRow>
      );
    }
    if (!entities || entities.length === 0) {
      return (
        <EmptyState
          variant="empty"
          title={t("screens4_22.entities.emptyTitle")}
          description={t("screens4_22.entities.libraryEmptyDescription")}
          actionText={t("screens4_22.entities.addEntity")}
          onAction={handleAdd}
        />
      );
    }
    return (
      <AutoGrid minItemWidth={180} gap={SPACING.md} sx={{ width: "100%" }}>
        {entities.map((entity) => (
          <EntityCard
            key={entity.id}
            entity={entity}
            onEdit={handleEdit}
            onRemove={handleRemove}
          />
        ))}
      </AutoGrid>
    );
  }, [isLoading, entities, handleAdd, handleEdit, handleRemove, t]);

  if (creating) {
    return (
      <FlexColumn fullWidth fullHeight>
        <EditorButton
          variant="text"
          startIcon={<ArrowBackIcon />}
          onClick={handleBack}
          disabled={setupBusy}
          sx={{ alignSelf: "flex-start", ml: SPACING.xl, mt: SPACING.md }}
        >
          {t("screens4_22.entities.backToEntities")}
        </EditorButton>
        <EntitySetupHost
          key={`${draftKey}:${startAssetId ?? ""}`}
          draftKey={draftKey}
          initialAssetId={startAssetId ?? undefined}
          onFinish={() => {
            setStartAssetId(null);
            setCreating(false);
          }}
          onBusyChange={setSetupBusy}
        />
      </FlexColumn>
    );
  }

  return (
    <FlexColumn gap={SPACING.md} sx={{ p: SPACING.md, width: "100%" }}>
      <FlexRow align="center" justify="space-between">
        <FlexColumn gap={0}>
          <Text size="big">{t("screens4_22.entities.entitiesLabel")}</Text>
          <Caption>{t("screens4_22.entities.librarySubtitle")}</Caption>
        </FlexColumn>
        <EditorButton
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAdd}
        >
          {t("screens4_22.entities.addEntity")}
        </EditorButton>
      </FlexRow>

      {content}

      {editorAssetId && (
        <EntityEditorDialog
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          assetId={editorAssetId}
          entity={editingEntity}
          projectId={projectId}
        />
      )}
    </FlexColumn>
  );
};

export const EntityLibrary = memo(EntityLibraryInternal);
export default EntityLibrary;
