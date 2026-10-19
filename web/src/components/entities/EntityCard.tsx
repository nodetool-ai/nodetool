/**
 * EntityCard — one reusable production entity (character, location, style, prop)
 * in the ingredients library: its reference image, name, kind badge, and the
 * descriptor injected into prompts. Edit / remove actions surface on the card.
 */

import React, { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import EditIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import type { Entity } from "@nodetool-ai/protocol";
import {
  Card,
  Caption,
  TruncatedText,
  TYPOGRAPHY,
  Chip,
  FlexRow,
  FlexColumn,
  ToolbarIconButton,
  SPACING
} from "../ui_primitives";
import ImageRefPreview from "../node/ImageRefPreview";
import { ENTITY_KIND_COLOR } from "./entityKind";

interface EntityCardProps {
  entity: Entity;
  onEdit?: (entity: Entity) => void;
  onRemove?: (entity: Entity) => void;
}

const EntityCardInternal: React.FC<EntityCardProps> = ({
  entity,
  onEdit,
  onRemove
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const referenceImage = entity.reference_images?.[0];

  const handleEdit = useCallback(() => onEdit?.(entity), [onEdit, entity]);
  const handleRemove = useCallback(
    () => onRemove?.(entity),
    [onRemove, entity]
  );

  return (
    <Card
      variant="outlined"
      padding="none"
      className="entity-card"
      sx={{ overflow: "hidden" }}
    >
      <div
        style={{
          width: "100%",
          aspectRatio: "1 / 1",
          background: theme.vars.palette.background.default,
          overflow: "hidden"
        }}
      >
        <ImageRefPreview
          value={referenceImage}
          placeholder={
            <FlexRow
              align="center"
              justify="center"
              sx={{ width: "100%", height: "100%" }}
            >
              <Caption sx={{ color: theme.vars.palette.text.disabled }}>
                {t("screens4_22.entities.noImage")}
              </Caption>
            </FlexRow>
          }
        />
      </div>

      <FlexColumn gap={SPACING.xs} sx={{ p: SPACING.xs }}>
        <FlexRow align="center" justify="space-between" gap={SPACING.micro}>
          <TruncatedText sx={{ ...TYPOGRAPHY.sans.label }}>
            {entity.name || t("screens4_22.entities.untitled")}
          </TruncatedText>
          <Chip
            label={t(`screens4_22.entities.kinds.${entity.kind}`)}
            compact
            variant="outlined"
            color={ENTITY_KIND_COLOR[entity.kind]}
            sx={{ flexShrink: 0 }}
          />
        </FlexRow>

        <Caption
          sx={{
            color: theme.vars.palette.text.secondary,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden"
          }}
        >
          {entity.descriptor}
        </Caption>

        <FlexRow gap={SPACING.micro} justify="flex-end">
          {onEdit && (
            <ToolbarIconButton
              size="small"
              title={t("screens4_22.entities.editEntity")}
              ariaLabel={t("screens4_22.entities.editEntityFor", {
                name: entity.name || t("screens4_22.entities.untitled")
              })}
              onClick={handleEdit}
            >
              <EditIcon fontSize="small" />
            </ToolbarIconButton>
          )}
          {onRemove && (
            <ToolbarIconButton
              size="small"
              title={t("screens4_22.entities.removeEntity")}
              ariaLabel={t("screens4_22.entities.removeEntityFor", {
                name: entity.name || t("screens4_22.entities.untitled")
              })}
              onClick={handleRemove}
            >
              <DeleteOutlineIcon fontSize="small" />
            </ToolbarIconButton>
          )}
        </FlexRow>
      </FlexColumn>
    </Card>
  );
};

export const EntityCard = memo(EntityCardInternal);
export default EntityCard;
