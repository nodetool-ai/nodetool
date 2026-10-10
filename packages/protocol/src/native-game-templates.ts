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

const TOP_DOWN: NativeGameTemplate = {
  id: "topdown",
  name: "Top-down room",
  description:
    "Walk one walled room seen from above and pick up the collectible to win.",
  manifest: gameAssetManifest.parse({
    version: 1,
    template: "topdown",
    engineVersion: "1",
    slots: [
      { id: "player", kind: "spritesheet", cell: [32, 32], animations: { idle: 1, walk: 4 }, prompt: "top-down player character" },
      { id: "wall", kind: "tileset", cell: [32, 32], count: 1, prompt: "top-down stone wall tile" },
      { id: "gem", kind: "spritesheet", cell: [32, 32], animations: { idle: 1 }, prompt: "bright collectible gem" },
      { id: "sfx.collect", kind: "sfx", seconds: 0.4, prompt: "short collection chime" }
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
