/**
 * The Game flow's small rules, kept apart from the step components so they
 * can be read and tested without the model pickers they sit beside.
 */

import type { GameSlotSpec, GameStyleChoice } from "@nodetool-ai/protocol";
import type { GameDesign } from "@nodetool-ai/protocol/api-schemas/workflows.js";

import type { StylePresetEntity } from "../../../serverState/useStylePresets";

/** What one slot is, in a few words. */
export const describeGameSlot = (slot: GameSlotSpec): string => {
  switch (slot.kind) {
    case "spritesheet": {
      const animations = Object.entries(slot.animations)
        .map(([name, frames]) =>
          frames === 1 ? name : `${name} (${frames} frames)`
        )
        .join(", ");
      return `${slot.id}: ${slot.cell[0]}×${slot.cell[1]} sprite, ${animations}`;
    }
    case "tileset":
      return `${slot.id}: ${slot.cell[0]}×${slot.cell[1]} tile`;
    case "image":
      return `${slot.id}: ${slot.size[0]}×${slot.size[1]} image`;
    case "sfx":
      return `${slot.id}: sound effect`;
    case "music":
      return `${slot.id}: music`;
  }
};

/** The design text a build cannot go without. */
export const gameDesignGaps = (
  design: GameDesign,
  slots: readonly GameSlotSpec[]
): string[] => {
  const gaps: string[] = [];
  if (design.title.trim().length === 0) {
    gaps.push("a title");
  }
  for (const member of design.cast) {
    if (member.descriptor.trim().length === 0) {
      gaps.push(`how ${member.name.trim() || member.slot_id} looks`);
    }
  }
  for (const slot of slots) {
    if (slot.kind === "sfx" || slot.kind === "music") {
      continue;
    }
    const prompt = design.slot_prompts.find(
      (entry) => entry.slot_id === slot.id
    );
    if (!prompt || prompt.prompt.trim().length === 0) {
      gaps.push(`what the ${slot.id} art shows`);
    }
  }
  return gaps;
};

/** The trailing tile's id: draw without a style descriptor. */
export const NO_GAME_STYLE_ID = "no-style";

/** `provider:id`, as `settings.game.image_model` stores it. */
export const imageModelTileId = (model: {
  provider: string;
  id: string;
}): string => `${model.provider}:${model.id}`;

/** The stored tile id back as a provider and model id. */
export const parseImageModelTileId = (
  tileId: string | undefined
): { provider: string; id: string } | null => {
  if (!tileId) {
    return null;
  }
  const split = tileId.indexOf(":");
  if (split <= 0 || split === tileId.length - 1) {
    return null;
  }
  return { provider: tileId.slice(0, split), id: tileId.slice(split + 1) };
};

/** The style a build pastes into every image prompt. */
export const gameStyleChoice = (
  presets: readonly StylePresetEntity[],
  entityId: string | null
): GameStyleChoice | null => {
  const preset = presets.find((entry) => entry.entityId === entityId);
  return preset ? { name: preset.name, descriptor: preset.descriptor } : null;
};
