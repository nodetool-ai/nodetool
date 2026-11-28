/**
 * The built-in engine's game templates: the asset slots each one plays with.
 *
 * Pure data, so the web Game flow designs against the same manifest the
 * headless `design_game` and `build_game` capabilities read through
 * `@nodetool-ai/game-nodes`.
 */

import { gameAssetManifest, type GameAssetManifest } from "./game-assets.js";

export interface NativeGameTemplate {
  readonly id: string;
  readonly name: string;
  /** One line on how a game built from it plays. */
  readonly description: string;
  readonly manifest: GameAssetManifest;
}

/**
 * The top-down adventure the guided Game flow builds: rooms joined by
 * corridors, gems to collect, enemies that patrol or chase, floor hazards and
 * a sealed exit that opens once every gem is taken. The level itself comes
 * from `createAdventureGame` in `@nodetool-ai/game-runtime`; these are the
 * slots its art and sound are drawn into. The sheet animations match its
 * `ADVENTURE_SHEETS`, which the build reads frames back by.
 */
const TOP_DOWN: NativeGameTemplate = {
  id: "topdown",
  name: "Top-down adventure",
  description:
    "Explore a dungeon of rooms seen from above, collect every gem while dodging enemies and hazards, then escape through the exit.",
  manifest: gameAssetManifest.parse({
    version: 1,
    template: "topdown",
    engineVersion: "1",
    slots: [
      { id: "player", kind: "spritesheet", cell: [32, 32], animations: { idle: 1, walk: 4 }, prompt: "top-down player character" },
      { id: "enemy", kind: "spritesheet", cell: [32, 32], animations: { idle: 2, move: 2 }, prompt: "top-down enemy creature" },
      { id: "gem", kind: "spritesheet", cell: [32, 32], animations: { idle: 1 }, prompt: "bright collectible gem" },
      { id: "hazard", kind: "spritesheet", cell: [32, 32], animations: { idle: 1 }, prompt: "floor hazard seen from above, such as spikes or fire" },
      { id: "exit", kind: "spritesheet", cell: [32, 32], animations: { closed: 1, open: 1 }, prompt: "the level exit seen from above, first sealed, then open and glowing" },
      { id: "floor", kind: "tileset", cell: [32, 32], count: 1, solid: [], prompt: "top-down dungeon floor tile" },
      { id: "wall", kind: "tileset", cell: [32, 32], count: 1, prompt: "top-down stone wall tile" },
      { id: "sfx.collect", kind: "sfx", seconds: 0.4, prompt: "short collection chime" },
      { id: "sfx.hurt", kind: "sfx", seconds: 0.4, prompt: "short pained grunt" },
      { id: "music.level", kind: "music", seconds: 60, loop: true, prompt: "looping adventure theme" }
    ]
  })
};

export const NATIVE_GAME_TEMPLATES: readonly NativeGameTemplate[] = [TOP_DOWN];

/** The template with this id, or null. */
export function findNativeGameTemplate(id: string): NativeGameTemplate | null {
  return NATIVE_GAME_TEMPLATES.find((template) => template.id === id) ?? null;
}

/** The template a new game starts on. */
export const DEFAULT_NATIVE_GAME_TEMPLATE = TOP_DOWN.id;
