/**
 * Which board entities apply to a shot. Pure so the rule is unit-testable and
 * identical between the generation path (useGenerateShot, which sends the
 * selected entities to the provider layer for descriptor/reference-image
 * expansion) and the UI (ShotCard's entity chips).
 */

import type { Entity, Shot } from "@nodetool-ai/protocol";

/**
 * The board entities that apply to `shot`.
 *
 * A shot with an explicit `entity_ids` override uses exactly that selection
 * (an empty array means "none" — the user removed them all). Otherwise the
 * default rule: styles and locations shape every shot, while characters and
 * props apply when their name appears in the shot's text (action, motion,
 * dialogue, narration, or slug), so a cast member only seasons the shots they
 * are actually in.
 */
export const entitiesForShot = (
  shot: Shot,
  boardEntities: Entity[]
): Entity[] => {
  if (shot.entity_ids) {
    const chosen = new Set(shot.entity_ids);
    return boardEntities.filter((e) => chosen.has(e.id));
  }
  const text = [
    shot.action,
    shot.motion,
    shot.dialogue,
    shot.narration,
    shot.slug
  ]
    .filter((part): part is string => !!part)
    .join("\n")
    .toLowerCase();
  return boardEntities.filter((entity) => {
    if (entity.kind === "style" || entity.kind === "location") {
      return true;
    }
    const name = entity.name.trim().toLowerCase();
    return name.length > 0 && text.includes(name);
  });
};
