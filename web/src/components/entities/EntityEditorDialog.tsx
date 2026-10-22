/**
 * EntityEditorDialog — tag an existing image asset as a reusable entity, or edit
 * an existing entity's fields, including the picture it shows. Swapping the
 * picture points the marker at another image asset; the entity keeps the id
 * boards and scripts cast it by.
 */

import React, { memo, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import type { Entity, EntityKind } from "@nodetool-ai/protocol";
import {
  BORDER_RADIUS,
  AlertBanner,
  CloseButton,
  Dialog,
  EditorButton,
  FlexRow,
  FormField,
  TextArea,
  TextInput,
  ToggleGroup,
  ToggleOption,
  FlexColumn,
  SPACING
} from "../ui_primitives";
import { useSaveEntity } from "../../serverState/useEntities";
import { mediaRefFromAsset } from "../../utils/mediaRef";
import { entityAssistContext } from "../../utils/textAssist";
import ImageRefPreview from "../node/ImageRefPreview";
import EntityAssetPickerDialog from "./EntityAssetPickerDialog";
import GenerateReferenceDialog from "./GenerateReferenceDialog";

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
  const { t } = useTranslation();
  const theme = useTheme();
  const saveEntity = useSaveEntity();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(false);
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
    try {
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
    } catch {
      // The mutation error is shown in the dialog below.
    }
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
      showCloseButton={false}
      titleActions={
        <CloseButton
          onClick={onClose}
          tooltip={t("screens4_22.entities.closeDialog")}
        />
      }
      title={
        entity
          ? t("screens4_22.entities.editEntity")
          : t("screens4_22.entities.newEntity")
      }
      maxWidth="xs"
      fullWidth
      onConfirm={handleConfirm}
      confirmText={
        entity
          ? t("screens4_22.entities.save")
          : t("screens4_22.entities.create")
      }
      cancelText={t("screens4_22.entities.cancel")}
      confirmDisabled={!canSave}
      isLoading={saveEntity.isPending}
    >
      <FlexColumn gap={SPACING.lg}>
        {saveEntity.isError && (
          <AlertBanner severity="error" role="alert">
            {t("screens4_22.entities.saveFailed")}
          </AlertBanner>
        )}

        <FormField label={t("screens4_22.entities.image")}>
          <FlexRow gap={SPACING.md} align="center" wrap>
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
            <EditorButton
              variant="outlined"
              onClick={() => setPickerOpen(true)}
              aria-label={t("screens4_22.entities.changeImage")}
            >
              {t("screens4_22.entities.changeImage")}
            </EditorButton>
            <EditorButton
              variant="outlined"
              startIcon={<AutoAwesomeOutlinedIcon />}
              onClick={() => setGeneratorOpen(true)}
            >
              {t("screens4_22.entities.retakeImage")}
            </EditorButton>
          </FlexRow>
        </FormField>

        <FormField label={t("screens4_22.entities.kind")}>
          <ToggleGroup
            value={kind}
            exclusive
            onChange={handleKindChange}
            size="small"
            segmented
          >
            {KINDS.map((k) => (
              <ToggleOption key={k} value={k}>
                {t(`screens4_22.entities.kinds.${k}`)}
              </ToggleOption>
            ))}
          </ToggleGroup>
        </FormField>

        <TextInput
          label={t("screens4_22.entities.name")}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          size="small"
          compact
        />

        <TextArea
          label={t("screens4_22.entities.descriptor")}
          required
          helperText={t("screens4_22.entities.descriptorHelp")}
          value={descriptor}
          onChange={setDescriptor}
          minRows={3}
          size="small"
          compact
          assistContext={entityAssistContext(kind, name)}
        />

        {kind === "character" && (
          <TextInput
            label={t("screens4_22.entities.voiceId")}
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
            size="small"
            compact
          />
        )}

        <TextInput
          label={t("screens4_22.entities.tags")}
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
      {generatorOpen ? (
        <GenerateReferenceDialog
          open
          name={name.trim()}
          kind={kind}
          descriptor={descriptor}
          currentAssetId={referenceAssetId}
          onClose={() => setGeneratorOpen(false)}
          onPick={setReferenceAssetId}
        />
      ) : null}
    </Dialog>
  );
};

export const EntityEditorDialog = memo(EntityEditorDialogInternal);
export default EntityEditorDialog;
