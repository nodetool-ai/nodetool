// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, AudioRef } from "../types.js";

// Sprite Sheet — nodetool.game.SpriteSheet
export type SpriteSheetInputs = {
  image?: Connectable<ImageRef>;
  cell_width?: Connectable<number>;
  cell_height?: Connectable<number>;
  animations?: Connectable<Record<string, unknown>>;
  fps?: Connectable<number>;
  slot_id?: Connectable<string>;
  loop?: Connectable<Record<string, unknown>>;
};

export interface SpriteSheetOutputs {
  output: ImageRef;
  fill: Record<string, unknown>;
}

export function spriteSheet(inputs: SpriteSheetInputs): DslNode<SpriteSheetOutputs> {
  return createNode("nodetool.game.SpriteSheet", inputs, { outputNames: ["output", "fill"] });
}

// Tileset — nodetool.game.Tileset
export type TilesetInputs = {
  image?: Connectable<ImageRef>;
  cell_width?: Connectable<number>;
  cell_height?: Connectable<number>;
  count?: Connectable<number>;
  slot_id?: Connectable<string>;
};

export interface TilesetOutputs {
  output: ImageRef;
  fill: Record<string, unknown>;
}

export function tileset(inputs: TilesetInputs): DslNode<TilesetOutputs> {
  return createNode("nodetool.game.Tileset", inputs, { outputNames: ["output", "fill"] });
}

// Seamless Image — nodetool.game.SeamlessImage
export type SeamlessImageInputs = {
  image?: Connectable<ImageRef>;
  slot_id?: Connectable<string>;
  check_x?: Connectable<boolean>;
  check_y?: Connectable<boolean>;
  threshold?: Connectable<number>;
};

export interface SeamlessImageOutputs {
  output: ImageRef;
  fill: Record<string, unknown>;
}

export function seamlessImage(inputs: SeamlessImageInputs): DslNode<SeamlessImageOutputs> {
  return createNode("nodetool.game.SeamlessImage", inputs, { outputNames: ["output", "fill"] });
}

// Game Sound Effect — nodetool.game.SoundEffect
export type SoundEffectInputs = {
  audio?: Connectable<AudioRef>;
  slot_id?: Connectable<string>;
  seconds?: Connectable<number>;
  trim?: Connectable<boolean>;
};

export interface SoundEffectOutputs {
  output: AudioRef;
  fill: Record<string, unknown>;
}

export function soundEffect(inputs: SoundEffectInputs): DslNode<SoundEffectOutputs> {
  return createNode("nodetool.game.SoundEffect", inputs, { outputNames: ["output", "fill"] });
}

// Game Music Loop — nodetool.game.MusicLoop
export type MusicLoopInputs = {
  audio?: Connectable<AudioRef>;
  slot_id?: Connectable<string>;
  seconds?: Connectable<number>;
  crossfade_ms?: Connectable<number>;
  trim?: Connectable<boolean>;
};

export interface MusicLoopOutputs {
  output: AudioRef;
  fill: Record<string, unknown>;
}

export function musicLoop(inputs: MusicLoopInputs): DslNode<MusicLoopOutputs> {
  return createNode("nodetool.game.MusicLoop", inputs, { outputNames: ["output", "fill"] });
}
