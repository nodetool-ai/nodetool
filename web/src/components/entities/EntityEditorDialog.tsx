/**
 * EntityEditorDialog — tag an existing image asset as a reusable entity, or edit
 * an existing entity's fields, including the picture it shows. Swapping the
 * picture points the marker at another image asset; the entity keeps the id
 * boards and scripts cast it by.
 */

import React, { memo, useCallback, useEffect, useState } from "react";
import { useTheme } from "@mui/material/styles";
import type { Entity, EntityKind } from "@nodetool-ai/protocol";
import {
  BORDER_RADIUS,
  Dialog,
  EditorButton,
  FlexRow,
  Label,
  TextInput,
  ToggleGroup,
  ToggleOption,
  FlexColumn,
  SPACING
} from "../ui_primitives";
import { useSaveEntity } from "../../serverState/useEntities";
import { mediaRefFromAsset } from "../../utils/mediaRef";
import ImageRefPreview from "../node/ImageRefPreview";
import EntityAssetPickerDialog from "./EntityAssetPickerDialog";

interface EntityEditorDialogProps {
  open: boolean;
  onClose: () => void;
  /** The asset carrying the entity marker — the entity's id once saved. */
  assetId: string;
  /** When editing, prefill from this entity. */
  entity?: Entity;
  /**
   * File the entity under this project on save. Omitted leaves its membership
   * alone, which is what the library page and the left panel want — only a
   * project surface files what it creates.
   */
  projectId?: string;
  onSaved?: (entity: Entity | null) => void;
}

const PREVIEW_SIZE = 96;

const KINDS: EntityKind[] = ["character", "location", "style", "prop"];

const EntityEditorDialogInternal: React.FC<EntityEditorDialogProps> = ({
  open,
  onClose,
  assetId,
  entity,
  projectId,
  onSaved
}) => {
  const theme = useTheme();
  const saveEntity = useSaveEntity();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [referenceAssetId, setReferenceAssetId] = useState(assetId);
  const [kind, setKind] = useState<EntityKind>("character");
  const [name, setName] = useState("");
  const [descriptor, setDescriptor] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [tags, setTags] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    setReferenceAssetId(entity?.reference_images?.[0]?.asset_id ?? assetId);
    setKind(entity?.kind ?? "character");
    setName(entity?.name ?? "");
    setDescriptor(entity?.descriptor ?? "");
    setVoiceId(entity?.voice_id ?? "");
    setTags(entity?.tags?.join(", ") ?? "");
  }, [open, entity, assetId]);

  const handlePickImage = useCallback((picked: string) => {
    setReferenceAssetId(picked);
    setPickerOpen(false);
  }, []);

  const handleKindChange = useCallback(
    (_e: React.MouseEvent<HTMLElement>, value: EntityKind | null) => {
      if (value) {
        setKind(value);
      }
    },
    []
  );

  const handleConfirm = useCallback(async () => {
    // A new entity simply IS the picked image, so changing it there changes
    // which asset gets the marker. An existing one keeps its id and points at
    // the new picture instead.
    const saved = await saveEntity.mutateAsync({
      assetId: entity ? assetId : referenceAssetId,
      projectId,
      kind,
      name: name.trim(),
      descriptor: descriptor.trim(),
      voice_id: kind === "character" ? voiceId.trim() || null : null,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      reference_asset_id: referenceAssetId
    });
    onSaved?.(saved);
    onClose();
  }, [
    saveEntity,
    entity,
    assetId,
    projectId,
    kind,
    name,
    descriptor,
    voiceId,
    tags,
    referenceAssetId,
    onSaved,
    onClose
  ]);

  const canSave = name.trim().length > 0 && descriptor.trim().length > 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={entity ? "Edit entity" : "New entity"}
      showActions
      onConfirm={handleConfirm}
      confirmText={entity ? "Save" : "Create"}
      confirmDisabled={!canSave}
      isLoading={saveEntity.isPending}
    >
      <FlexColumn gap={SPACING.md} sx={{ pt: 1, minWidth: 360 }}>
        <FlexColumn gap={SPACING.xs}>
          <Label>Image</Label>
          <FlexRow gap={SPACING.md} align="center">
            <div
              style={{
                width: PREVIEW_SIZE,
                height: PREVIEW_SIZE,
                flexShrink: 0,
                overflow: "hidden",
                borderRadius: BORDER_RADIUS.sm,
                background: theme.vars.palette.background.default
              }}
            >
              <ImageRefPreview
                value={mediaRefFromAsset({ id: referenceAssetId }, "image")}
              />
            </div>
            <EditorButton variant="outlined" onClick={() => setPickerOpen(true)}>
              Change image
            </EditorButton>
          </FlexRow>
        </FlexColumn>

        <FlexColumn gap={SPACING.xs}>
          <Label>Kind</Label>
          <ToggleGroup
            value={kind}
            exclusive
            onChange={handleKindChange}
            size="small"
            segmented
          >
            {KINDS.map((k) => (
              <ToggleOption key={k} value={k}>
                {k}
              </ToggleOption>
            ))}
          </ToggleGroup>
        </FlexColumn>

        <TextInput
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          size="small"
          compact
        />

        <TextInput
          label="Descriptor"
          helperText="Pasted verbatim into every prompt that uses this entity."
          value={descriptor}
          onChange={(e) => setDescriptor(e.target.value)}
          multiline
          rows={3}
          size="small"
          compact
        />

        {kind === "character" && (
          <TextInput
            label="Voice id (optional)"
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
            size="small"
            compact
          />
        )}

        <TextInput
          label="Tags (comma-separated)"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          size="small"
          compact
        />
      </FlexColumn>

      <EntityAssetPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={handlePickImage}
        projectId={projectId}
      />
    </Dialog>
  );
};

export const EntityEditorDialog = memo(EntityEditorDialogInternal);
export default EntityEditorDialog;
