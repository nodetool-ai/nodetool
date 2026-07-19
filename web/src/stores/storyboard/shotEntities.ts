/**
 * Which board entities apply to a shot, and how their descriptors enter the
 * shot's still/clip prompts. Pure functions so the rule is unit-testable and
 * identical between the generation path (useGenerateShot) and the UI
 * (ShotCard's entity chips).
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

/**
 * Append the entities' canonical descriptors to a generation prompt as a
 * `Consistency references:` block — the same shape the Apply Entities node
 * and the runtime's entity-mention expansion produce.
 */
export const injectShotEntities = (
  prompt: string,
  entities: Entity[]
): string => {
  const lines = entities
    .filter((e) => e.descriptor.trim().length > 0)
    .map((e) => `- ${e.name}: ${e.descriptor.trim()}`);
  if (lines.length === 0) {
    return prompt;
  }
  return `${prompt}\n\nConsistency references:\n${lines.join("\n")}`;
};
