/**
 * EntityCard — one reusable production entity (character, location, style, prop)
 * in the ingredients library: its reference image, name, kind badge, and the
 * descriptor injected into prompts. Edit / remove actions surface on the card.
 */

import React, { memo, useCallback } from "react";
import { useTheme } from "@mui/material/styles";
import EditIcon from "@mui/icons-material/Edit";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import type { Entity } from "@nodetool-ai/protocol";
import {
  Card,
  Text,
  Caption,
  Chip,
  FlexRow,
  FlexColumn,
  ToolbarIconButton,
  SPACING
} from "../ui_primitives";
import ImageRefPreview from "../node/ImageRefPreview";
import { getEntityKindChipSx } from "./entityKind";

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
      sx={{ overflow: "hidden", display: "flex", flexDirection: "column" }}
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
                No image
              </Caption>
            </FlexRow>
          }
        />
      </div>

      <FlexColumn gap={SPACING.xs} sx={{ p: 1 }}>
        <FlexRow align="center" justify="space-between" gap={0.5}>
          <Text
            sx={{
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {entity.name || "Untitled"}
          </Text>
          <Chip
            label={entity.kind}
            compact
            variant="outlined"
            sx={{ ...getEntityKindChipSx(entity.kind), flexShrink: 0 }}
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

        <FlexRow gap={0.5} justify="flex-end">
          {onEdit && (
            <ToolbarIconButton
              size="small"
              title="Edit entity"
              onClick={handleEdit}
            >
              <EditIcon fontSize="small" />
            </ToolbarIconButton>
          )}
          {onRemove && (
            <ToolbarIconButton
              size="small"
              title="Remove entity"
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
