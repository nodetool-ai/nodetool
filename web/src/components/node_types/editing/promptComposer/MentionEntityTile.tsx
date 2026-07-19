/** @jsxImportSource @emotion/react */
/**
 * MentionEntityTile — one entity (character, location, style, prop) in the
 * `@`-mention picker's Entities row. A compact pill: round reference-image
 * avatar (kind icon when there is none), the entity name, and a kind label,
 * with the descriptor as the hover title so pick decisions don't need a
 * round-trip to the library.
 */
import React from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type { Entity } from "@nodetool-ai/protocol";

import { BORDER_RADIUS, MOTION, reducedMotion } from "../../../ui_primitives";
import { ENTITY_KIND_COLOR, ENTITY_KIND_ICON } from "../../../entities/entityKind";

const styles = (theme: Theme) =>
  css({
    display: "inline-flex",
    alignItems: "center",
    gap: theme.spacing(0.75),
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
      borderRadius: "50%",
      objectFit: "cover",
      display: "block",
      background: theme.vars.palette.background.default
    },
    ".entity-avatar-icon": {
      flex: "0 0 auto",
      width: 28,
      height: 28,
      borderRadius: "50%",
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
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeTiny,
      textTransform: "uppercase",
      letterSpacing: "0.04em"
    }
  });

export interface MentionEntityTileProps {
  entity: Entity;
  selected: boolean;
  onSelect: () => void;
  onMouseEnter: () => void;
}

export const MentionEntityTile: React.FC<MentionEntityTileProps> = ({
  entity,
  selected,
  onSelect,
  onMouseEnter
}) => {
  const theme = useTheme();
  const thumb = entity.reference_images?.[0]?.uri;
  const Icon = ENTITY_KIND_ICON[entity.kind];
  const kindPaletteKey = ENTITY_KIND_COLOR[entity.kind];

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      css={styles(theme)}
      className={`mention-entity-tile${selected ? " selected" : ""}`}
      title={entity.descriptor || entity.name}
      // preventDefault keeps focus in the composer so selection inserts at the
      // caret instead of blurring the editor.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
    >
      {thumb ? (
        <img className="entity-avatar" src={thumb} alt="" />
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
        {entity.kind}
      </span>
    </button>
  );
};

export default MentionEntityTile;
