/** @jsxImportSource @emotion/react */
import React from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type { EntityKind } from "@nodetool-ai/protocol";

import { BORDER_RADIUS, Tooltip } from "../../../ui_primitives";
import { useAssetById } from "../../../../serverState/useAssetById";
import { readEntityMarker } from "../../../../serverState/useEntities";
import { ENTITY_KIND_ICON } from "../../../entities/entityKind";
import { parseEntityUri } from "./promptTokens";

// The entity pill: kind icon (or tiny reference-image thumb), then the entity
// name. Rendered in the secondary palette so an entity mention reads as a
// different thing than an asset mention at a glance.
const chipStyles = (theme: Theme) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    gap: "0.3em",
    verticalAlign: "baseline",
    margin: `0 ${theme.spacing(0.5)}`,
    padding: "0.05em 0.45em",
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: theme.vars.palette.secondary.main,
    color: theme.vars.palette.secondary.contrastText,
    fontFamily: theme.fontFamily2,
    fontSize: theme.fontSizeSmaller,
    lineHeight: 1.6,
    maxWidth: 240,
    whiteSpace: "nowrap",
    userSelect: "none",
    "& .chip-icon": { fontSize: "1em", flex: "0 0 auto" },
    "& .chip-thumb": {
      flex: "0 0 auto",
      display: "block",
      height: "1.5em",
      width: "1.5em",
      objectFit: "cover",
      borderRadius: "50%"
    },
    "& .chip-label": {
      minWidth: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  });

// Hover card: full reference image plus the descriptor that will be injected
// into the prompt, so the user can see exactly what the mention contributes.
const previewCardStyles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(0.75),
    padding: theme.spacing(0.75),
    background: theme.vars.palette.background.paper,
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: BORDER_RADIUS.lg,
    boxShadow: theme.shadows[6],
    maxWidth: 280,
    "& img": {
      display: "block",
      maxWidth: 260,
      maxHeight: 200,
      width: "auto",
      height: "auto",
      objectFit: "contain",
      borderRadius: BORDER_RADIUS.sm,
      background: theme.vars.palette.grey[900]
    },
    "& .preview-name": {
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmall,
      fontWeight: 600,
      color: theme.vars.palette.text.primary
    },
    "& .preview-descriptor": {
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.text.secondary,
      whiteSpace: "normal"
    }
  });

export const EntityMentionChip: React.FC<{
  uri: string;
  label: string;
  thumb?: string;
}> = ({ uri, label, thumb }) => {
  const theme = useTheme();
  const entityId = parseEntityUri(uri);
  // Resolve live so a renamed / re-described entity updates every mention.
  const { data: asset } = useAssetById(entityId || undefined);
  const marker = readEntityMarker(asset?.metadata);
  const kind: EntityKind = marker?.kind ?? "character";
  const displayLabel = marker?.name || label;
  const thumbUrl = thumb || asset?.thumb_url || asset?.get_url || undefined;
  const previewUrl = asset?.thumb_url || asset?.get_url || thumb || undefined;
  const Icon = ENTITY_KIND_ICON[kind];

  const chip = (
    <span
      css={chipStyles(theme)}
      className="entity-mention-chip nodrag"
      contentEditable={false}
      title={marker ? undefined : displayLabel}
    >
      {thumbUrl ? (
        <img className="chip-thumb" src={thumbUrl} alt="" />
      ) : (
        <Icon className="chip-icon" />
      )}
      <span className="chip-label">{displayLabel}</span>
    </span>
  );

  if (!marker) {
    return chip;
  }

  return (
    <Tooltip
      placement="top"
      delay={250}
      title={
        <div css={previewCardStyles(theme)}>
          {previewUrl && <img src={previewUrl} alt={displayLabel} />}
          <span className="preview-name">
            {displayLabel} · {kind}
          </span>
          {marker.descriptor && (
            <span className="preview-descriptor">{marker.descriptor}</span>
          )}
        </div>
      }
      slotProps={{
        tooltip: {
          sx: {
            p: 0,
            m: 0,
            maxWidth: "none",
            backgroundColor: "transparent"
          }
        }
      }}
    >
      {chip}
    </Tooltip>
  );
};
