/**
 * ShotActionText
 *
 * A shot's action line with the cast in it named as chips (PRD § 7.4,
 * criterion 12), so a glance at the grid says which character or prop a shot
 * carries without opening it.
 *
 * Which entities count is not decided here: `entitiesForShot` is the one rule
 * for that, the same one the render path seasons prompts with, so a chip on a
 * card means the entity reaches that shot's prompt. This only finds where those
 * entities' names fall in the text, by the same case-insensitive match.
 */

import React from "react";
import type { Entity } from "@nodetool-ai/protocol";

import { Chip, Text, BORDER_RADIUS, SPACING } from "../ui_primitives";

/** A run of the action line: plain prose, or one entity's name. */
export interface ActionSegment {
  text: string;
  /** Set when this run is an entity's name, and which entity it names. */
  entity?: Entity;
}

/**
 * Split `action` into prose and entity-name runs.
 *
 * Longest name first, so "Ada Lovelace" wins over a cast member also called
 * "Ada" and the shorter name cannot cut the longer one in half.
 */
export const splitActionByEntities = (
  action: string,
  entities: readonly Entity[]
): ActionSegment[] => {
  const named = entities
    .filter((entity) => entity.name.trim().length > 0)
    .sort((a, b) => b.name.trim().length - a.name.trim().length);
  if (named.length === 0 || action.length === 0) {
    return action ? [{ text: action }] : [];
  }
  const haystack = action.toLowerCase();
  const segments: ActionSegment[] = [];
  let prose = "";
  let cursor = 0;
  while (cursor < action.length) {
    const hit = named.find((entity) =>
      haystack.startsWith(entity.name.trim().toLowerCase(), cursor)
    );
    if (!hit) {
      prose += action[cursor];
      cursor += 1;
      continue;
    }
    if (prose) {
      segments.push({ text: prose });
      prose = "";
    }
    const length = hit.name.trim().length;
    segments.push({ text: action.slice(cursor, cursor + length), entity: hit });
    cursor += length;
  }
  if (prose) {
    segments.push({ text: prose });
  }
  return segments;
};

interface ShotActionTextProps {
  action: string;
  /** The entities that apply to this shot, from `entitiesForShot`. */
  entities: readonly Entity[];
}

/** Chips sit on the text baseline so a clamped line still reads as prose. */
const chipSx = {
  verticalAlign: "baseline",
  mx: SPACING.micro,
  borderRadius: BORDER_RADIUS.sm
} as const;

export const ShotActionText: React.FC<ShotActionTextProps> = ({
  action,
  entities
}) => {
  const segments = splitActionByEntities(action, entities);
  return (
    <Text
      component="div"
      size="small"
      weight={400}
      lineClamp={2}
      sx={{ lineHeight: 1.45 }}
    >
      {segments.map((segment, index) =>
        segment.entity ? (
          <Chip
            key={`${segment.entity.id}-${index}`}
            component="span"
            compact
            variant="outlined"
            label={segment.text}
            data-testid="shot-entity-chip"
            sx={chipSx}
          />
        ) : (
          <React.Fragment key={`text-${index}`}>{segment.text}</React.Fragment>
        )
      )}
    </Text>
  );
};

export default ShotActionText;
