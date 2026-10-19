/**
 * TimelineReferencesField — the images and entities a generated video clip
 * renders with. Picked images are `[Image 1]`, `[Image 2]`, … in pick order,
 * so the prompt can name them. Entities follow them, each by its name.
 */

import React, { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import CloseIcon from "@mui/icons-material/CloseOutlined";
import type { Entity } from "@nodetool-ai/protocol";

import EntityAssetPickerDialog from "../entities/EntityAssetPickerDialog";
import { CreateEntityButton } from "../entities/EntityListPanel";
import EntityTilesField from "../storyboard/EntityTilesField";
import {
  Box,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  FormField,
  ResponsiveImage,
  ToolbarIconButton,
  TruncatedText,
  BORDER_RADIUS,
  SPACING
} from "../ui_primitives";

export interface TimelineReferences {
  /** Image asset ids, in `[Image N]` order. */
  imageIds: string[];
  /** Picked entities, kept whole so the field can show them. */
  entities: Entity[];
}

export const EMPTY_TIMELINE_REFERENCES: TimelineReferences = {
  imageIds: [],
  entities: []
};

interface TimelineReferencesFieldProps {
  value: TimelineReferences;
  onChange: (value: TimelineReferences) => void;
  disabled?: boolean;
}

const thumbSx = {
  position: "relative",
  width: "6.5rem",
  flex: "0 0 auto",
  overflow: "hidden",
  borderRadius: BORDER_RADIUS.lg,
  border: "1px solid",
  borderColor: "divider",
  bgcolor: "background.paper"
} as const;

const removeSx = {
  position: "absolute",
  top: 0,
  right: 0,
  bgcolor: "background.paper",
  borderRadius: BORDER_RADIUS.circle
} as const;

const ImageThumb: React.FC<{
  assetId: string;
  caption: string;
  onRemove?: () => void;
}> = ({ assetId, caption, onRemove }) => {
  const { t } = useTranslation();
  return (
    <Box sx={thumbSx} data-testid="timeline-reference-image">
      <ResponsiveImage
        locator={{ asset_id: assetId }}
        preferThumbnail
        alt={caption}
        aspectRatio="3 / 4"
        fit="cover"
      />
      <TruncatedText variant="caption" sx={{ px: SPACING.xs }}>
        {caption}
      </TruncatedText>
      {onRemove && (
        <Box sx={removeSx}>
          <ToolbarIconButton
            icon={<CloseIcon fontSize="inherit" />}
            tooltip={t("i18n-next65.timeline.references.remove", {
              name: caption
            })}
            ariaLabel={t("i18n-next65.timeline.references.remove", {
              name: caption
            })}
            onClick={onRemove}
          />
        </Box>
      )}
    </Box>
  );
};

const TimelineReferencesFieldInner: React.FC<TimelineReferencesFieldProps> = ({
  value,
  onChange,
  disabled
}) => {
  const { t } = useTranslation();
  const [imagePickerOpen, setImagePickerOpen] = useState(false);

  const addImage = useCallback(
    (assetId: string) => {
      setImagePickerOpen(false);
      if (!value.imageIds.includes(assetId)) {
        onChange({ ...value, imageIds: [...value.imageIds, assetId] });
      }
    },
    [value, onChange]
  );

  const removeImage = useCallback(
    (assetId: string) =>
      onChange({
        ...value,
        imageIds: value.imageIds.filter((id) => id !== assetId)
      }),
    [value, onChange]
  );

  const toggleEntity = useCallback(
    (entity: Entity) => {
      const picked = value.entities.some((item) => item.id === entity.id);
      onChange({
        ...value,
        entities: picked
          ? value.entities.filter((item) => item.id !== entity.id)
          : [...value.entities, entity]
      });
    },
    [value, onChange]
  );

  const addEntity = useCallback(
    (entity: Entity) => {
      if (!value.entities.some((item) => item.id === entity.id)) {
        onChange({ ...value, entities: [...value.entities, entity] });
      }
    },
    [value, onChange]
  );

  return (
    <FlexColumn gap={SPACING.lg} data-testid="timeline-references">
      <FormField
        label={t("i18n-next65.timeline.references.imagesLabel")}
        helperText={t("i18n-next65.timeline.references.imagesHelper")}
      >
        <FlexColumn gap={SPACING.sm}>
          {value.imageIds.length > 0 ? (
            <FlexRow gap={SPACING.md} wrap>
              {value.imageIds.map((assetId, index) => (
                <ImageThumb
                  key={assetId}
                  assetId={assetId}
                  caption={t("i18n-next65.timeline.references.imageLabel", {
                    index: index + 1
                  })}
                  onRemove={disabled ? undefined : () => removeImage(assetId)}
                />
              ))}
            </FlexRow>
          ) : (
            <Caption color="secondary">
              {t("i18n-next65.timeline.references.noImages")}
            </Caption>
          )}
          {!disabled && (
            <FlexRow>
              <EditorButton
                variant="outlined"
                startIcon={<AddPhotoAlternateOutlinedIcon />}
                onClick={() => setImagePickerOpen(true)}
              >
                {t("i18n-next65.timeline.references.addImage")}
              </EditorButton>
            </FlexRow>
          )}
        </FlexColumn>
      </FormField>
      <EntityTilesField
        label={t("i18n-next65.timeline.references.entitiesLabel")}
        entities={value.entities}
        selectedIds={value.entities.map((entity) => entity.id)}
        onPick={toggleEntity}
        onRemove={toggleEntity}
        removeLabel={(name) =>
          t("i18n-next65.timeline.references.remove", { name })
        }
        emptyText={t("i18n-next65.timeline.references.entitiesEmpty")}
        readOnly={disabled}
        extraAction={
          <CreateEntityButton
            label={t("i18n-next65.timeline.references.newEntity")}
            onCreated={addEntity}
          />
        }
      />
      {imagePickerOpen && (
        <EntityAssetPickerDialog
          open
          title={t("i18n-next65.timeline.references.pickImageTitle")}
          onClose={() => setImagePickerOpen(false)}
          onPick={addImage}
        />
      )}
    </FlexColumn>
  );
};

export const TimelineReferencesField = memo(TimelineReferencesFieldInner);
TimelineReferencesField.displayName = "TimelineReferencesField";

export default TimelineReferencesField;
