/**
 * EntityTilesField — entities as reference-image tiles, each with its name
 * and a remove control, above a "Choose entities" button that opens the
 * library picker. The shot editor and the board settings both show their
 * entities through it; each decides what a pick and a removal change.
 */

import React, { memo, useRef, useState } from "react";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type { Entity } from "@nodetool-ai/protocol";

import EntityPicker from "../entities/EntityPicker";
import { ENTITY_KIND_ICON } from "../entities/entityKind";
import {
  Box,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  Label,
  Popover,
  ResponsiveImage,
  ToolbarIconButton,
  BORDER_RADIUS,
  MOTION,
  SPACING
} from "../ui_primitives";

export interface EntityTilesFieldProps {
  /** The entities shown as tiles, in order. */
  entities: readonly Entity[];
  /** Ids the picker draws as picked. */
  selectedIds: readonly string[];
  /** A pick in the library picker. */
  onPick: (entity: Entity) => void;
  onRemove: (entity: Entity) => void;
  /** The accessible name of a tile's remove control. */
  removeLabel: (name: string) => string;
  /** Shown when there are no tiles. */
  emptyText: string;
  /** A heading above the tiles, for a host that has no field label. */
  label?: string;
  readOnly?: boolean;
  /** A control beside "Choose entities", such as creating a new entity. */
  extraAction?: React.ReactNode;
  "data-testid"?: string;
}

const tileSx = {
  position: "relative",
  width: "6.5rem",
  flex: "0 0 auto",
  overflow: "hidden",
  borderRadius: BORDER_RADIUS.lg,
  border: "1px solid",
  borderColor: "divider",
  bgcolor: "background.paper",
  transition: MOTION.border,
  "&:hover, &:focus-within": { borderColor: "primary.main" }
} as const;

const removeSx = {
  position: "absolute",
  top: SPACING.xs,
  left: SPACING.xs,
  bgcolor: "c_overlay_strong",
  color: "common.white"
} as const;

const nameSx = {
  px: SPACING.sm,
  py: SPACING.xs,
  textAlign: "center",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "text.primary"
} as const;

const EntityTile: React.FC<{
  entity: Entity;
  removeLabel: string;
  onRemove?: (entity: Entity) => void;
}> = memo(({ entity, removeLabel, onRemove }) => {
  const Icon = ENTITY_KIND_ICON[entity.kind];
  const name = entity.name || "Untitled";
  const reference = entity.reference_images?.[0];
  return (
    <Box sx={tileSx} title={entity.descriptor || name} data-testid="entity-tile">
      {reference ? (
        <ResponsiveImage
          locator={reference}
          preferThumbnail
          alt={name}
          aspectRatio="3 / 4"
          fit="cover"
        />
      ) : (
        <FlexRow
          align="center"
          justify="center"
          sx={{ aspectRatio: "3 / 4", color: "text.disabled" }}
        >
          <Icon fontSize="large" />
        </FlexRow>
      )}
      <Caption sx={nameSx}>{name}</Caption>
      {onRemove && (
        <Box sx={removeSx}>
          <ToolbarIconButton
            icon={<CloseIcon sx={{ fontSize: "1em" }} />}
            tooltip={removeLabel}
            ariaLabel={removeLabel}
            onClick={() => onRemove(entity)}
          />
        </Box>
      )}
    </Box>
  );
});
EntityTile.displayName = "EntityTile";

const EntityTilesFieldInner: React.FC<EntityTilesFieldProps> = ({
  entities,
  selectedIds,
  onPick,
  onRemove,
  removeLabel,
  emptyText,
  label,
  readOnly,
  extraAction,
  "data-testid": testId
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const chooseRef = useRef<HTMLButtonElement | null>(null);

  return (
    <FlexColumn gap={SPACING.sm} data-testid={testId}>
      {label && <Label sx={{ color: "text.secondary" }}>{label}</Label>}
      {entities.length > 0 ? (
        <FlexRow gap={SPACING.md} wrap>
          {entities.map((entity) => (
            <EntityTile
              key={entity.id}
              entity={entity}
              removeLabel={removeLabel(entity.name || "Untitled")}
              onRemove={readOnly ? undefined : onRemove}
            />
          ))}
        </FlexRow>
      ) : (
        <Caption color="secondary">{emptyText}</Caption>
      )}
      {!readOnly && (
        <>
          <FlexRow gap={SPACING.sm} align="center">
            <EditorButton
              ref={chooseRef}
              variant="outlined"
              fullWidth
              endIcon={<ExpandMoreIcon />}
              onClick={() => setPickerOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={pickerOpen}
              sx={{ justifyContent: "space-between" }}
            >
              Choose entities
            </EditorButton>
            {extraAction}
          </FlexRow>
          <Popover
            open={pickerOpen}
            anchorEl={chooseRef.current}
            onClose={() => setPickerOpen(false)}
            placement="bottom-left"
            maxWidth="28rem"
          >
            <Box sx={{ p: SPACING.md, width: "28rem", maxWidth: "100%" }}>
              <EntityPicker
                onSelect={onPick}
                selectedIds={selectedIds}
                height="20rem"
                autoFocus
              />
            </Box>
          </Popover>
        </>
      )}
    </FlexColumn>
  );
};

export const EntityTilesField = memo(EntityTilesFieldInner);
EntityTilesField.displayName = "EntityTilesField";

export default EntityTilesField;
