/**
 * EntityLibrary — the ingredients page: a grid of reusable entities with an
 * "Add entity" flow (pick an image asset, then tag it) plus edit / remove. A
 * standalone page surface opened as a workspace tab.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import type { Entity } from "@nodetool-ai/protocol";
import {
  Dialog,
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
import type { Asset } from "../../stores/ApiTypes";
import { trpcClient } from "../../trpc/client";
import {
  useEntities,
  useDeleteEntity
} from "../../serverState/useEntities";
import ImageRefPreview from "../node/ImageRefPreview";
import EntityCard from "./EntityCard";
import EntityEditorDialog from "./EntityEditorDialog";

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
  gap: getSpacingPx(SPACING.md),
  width: "100%"
};

/** Small dialog that lists image assets so one can be tagged as an entity. */
const AssetPickerDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  onPick: (assetId: string) => void;
}> = ({ open, onClose, onPick }) => {
  const theme = useTheme();
  const { data, isLoading } = useQuery({
    queryKey: ["entity-asset-picker"],
    queryFn: async (): Promise<Asset[]> => {
      const result = await trpcClient.assets.search.query({
        query: "",
        page_size: 500
      });
      return (result.assets as Asset[]).filter((a) =>
        (a.content_type ?? "").startsWith("image/")
      );
    },
    enabled: open,
    staleTime: 30_000
  });

  return (
    <Dialog open={open} onClose={onClose} title="Pick a reference image">
      {isLoading ? (
        <FlexRow align="center" justify="center" sx={{ p: 3 }}>
          <LoadingSpinner />
        </FlexRow>
      ) : !data || data.length === 0 ? (
        <EmptyState
          variant="no-data"
          title="No images"
          description="Generate or upload an image first."
          size="small"
        />
      ) : (
        <div style={{ ...gridStyle, maxHeight: "60vh", overflow: "auto" }}>
          {data.map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => onPick(asset.id)}
              style={{
                border: `1px solid ${theme.vars.palette.divider}`,
                borderRadius: getSpacingPx(SPACING.xs),
                padding: 0,
                background: "transparent",
                cursor: "pointer",
                overflow: "hidden"
              }}
            >
              <div style={{ width: "100%", aspectRatio: "1 / 1" }}>
                <ImageRefPreview
                  value={{ type: "image", uri: asset.thumb_url ?? asset.get_url }}
                />
              </div>
              <Caption
                sx={{
                  display: "block",
                  p: 0.5,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                }}
              >
                {asset.name}
              </Caption>
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
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
          <Text sx={{ fontWeight: 700, fontSize: "var(--fontSizeBig)" }}>
            Entities
          </Text>
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

      <AssetPickerDialog
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
