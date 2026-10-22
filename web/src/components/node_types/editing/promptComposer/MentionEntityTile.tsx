/** @jsxImportSource @emotion/react */
/**
 * MentionEntityTile — one entity (character, location, style, prop) in the
 * `@`-mention picker's Entities row. A compact pill: round reference-image
 * avatar (kind icon when there is none), the entity name, and a kind label,
 * with the descriptor as the hover title so pick decisions don't need a
 * round-trip to the library.
 */
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type { Entity } from "@nodetool-ai/protocol";

import {
  BORDER_RADIUS,
  MOTION,
  reducedMotion,
  ResponsiveImage,
  SPACING,
  Tooltip,
  EYEBROW
} from "../../../ui_primitives";
import { ENTITY_KIND_COLOR, ENTITY_KIND_ICON } from "../../../entities/entityKind";

const styles = (theme: Theme) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    gap: theme.spacing(SPACING.xs),
    padding: `${theme.spacing(0.5)} ${theme.spacing(1)}`,
    borderRadius: BORDER_RADIUS.xl,
    border: "1px solid transparent",
    background: "transparent",
    cursor: "pointer",
    maxWidth: "100%",
    transition: `${MOTION.border}, ${MOTION.background}`,
    ...reducedMotion({ transition: MOTION.none }),
    "&:hover": {
      borderColor: theme.vars.palette.divider,
      background: theme.vars.palette.action.hover
    },
    "&.selected": {
      borderColor: theme.vars.palette.primary.main,
      background: theme.vars.palette.action.selected
    },
    ".entity-avatar": {
      flex: "0 0 auto",
      width: 28,
      height: 28,
      borderRadius: BORDER_RADIUS.circle,
      objectFit: "cover",
      overflow: "hidden",
      background: theme.vars.palette.background.default
    },
    ".entity-avatar-icon": {
      flex: "0 0 auto",
      width: 28,
      height: 28,
      borderRadius: BORDER_RADIUS.circle,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: theme.vars.palette.action.selected,
      "& svg": { fontSize: 18 }
    },
    ".entity-name": {
      minWidth: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.text.primary
    },
    ".entity-kind": {
      flex: "0 0 auto",
      ...EYEBROW,
    }
  });

interface MentionEntityTileProps {
  entity: Entity;
  selected: boolean;
  onSelect: () => void;
  onMouseEnter: () => void;
}

export const MentionEntityTile: React.FC<MentionEntityTileProps> = React.memo(({
  entity,
  selected,
  onSelect,
  onMouseEnter
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const tileStyles = useMemo(() => styles(theme), [theme]);
  // An `asset://` reference, not a URL: ResponsiveImage resolves it.
  const thumb = entity.reference_images?.[0];
  const Icon = ENTITY_KIND_ICON[entity.kind];
  const kindPaletteKey = ENTITY_KIND_COLOR[entity.kind];

  return (
    <Tooltip title={entity.descriptor || entity.name} describeChild>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        css={tileStyles}
        className={`mention-entity-tile${selected ? " selected" : ""}`}
        // preventDefault keeps focus in the composer so selection inserts at the
        // caret instead of blurring the editor.
        onMouseDown={(e) => e.preventDefault()}
        onClick={onSelect}
        onMouseEnter={onMouseEnter}
      >
        {thumb?.uri ? (
          <ResponsiveImage
            className="entity-avatar"
            locator={thumb}
            preferThumbnail
            alt=""
            fit="cover"
            borderRadius={BORDER_RADIUS.circle}
          />
        ) : (
          <span className="entity-avatar-icon">
            <Icon />
          </span>
        )}
        <span className="entity-name">{entity.name || entity.id}</span>
        <span
          className="entity-kind"
          style={{ color: theme.vars.palette[kindPaletteKey].main }}
        >
          {t(`i18n-next34.assetMention.entityKind.${entity.kind}`)}
        </span>
      </button>
    </Tooltip>
  );
});

MentionEntityTile.displayName = "MentionEntityTile";

export default MentionEntityTile;
