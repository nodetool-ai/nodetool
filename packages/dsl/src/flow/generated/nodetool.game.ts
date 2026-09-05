// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef, AudioRef } from "../../types.js";

// Sprite Sheet — nodetool.game.SpriteSheet
export type SpriteSheetInputs = {
  image?: ImageRef;
  cell_width?: number;
  cell_height?: number;
  animations?: Record<string, unknown>;
  fps?: number;
  slot_id?: string;
  loop?: Record<string, unknown>;
};

export interface SpriteSheetOutputs {
  output: ImageRef;
  fill: Record<string, unknown>;
}

export function spriteSheet(inputs: SpriteSheetInputs): Promise<SpriteSheetOutputs> {
  return callNode<SpriteSheetOutputs>("nodetool.game.SpriteSheet", inputs);
}

// Tileset — nodetool.game.Tileset
export type TilesetInputs = {
  image?: ImageRef;
  cell_width?: number;
  cell_height?: number;
  count?: number;
  slot_id?: string;
};

export interface TilesetOutputs {
  output: ImageRef;
  fill: Record<string, unknown>;
}

export function tileset(inputs: TilesetInputs): Promise<TilesetOutputs> {
  return callNode<TilesetOutputs>("nodetool.game.Tileset", inputs);
}

// Seamless Image — nodetool.game.SeamlessImage
export type SeamlessImageInputs = {
  image?: ImageRef;
  slot_id?: string;
  check_x?: boolean;
  check_y?: boolean;
  threshold?: number;
};

export interface SeamlessImageOutputs {
  output: ImageRef;
  fill: Record<string, unknown>;
}

export function seamlessImage(inputs: SeamlessImageInputs): Promise<SeamlessImageOutputs> {
  return callNode<SeamlessImageOutputs>("nodetool.game.SeamlessImage", inputs);
}

// Game Sound Effect — nodetool.game.SoundEffect
export type SoundEffectInputs = {
  audio?: AudioRef;
  slot_id?: string;
  seconds?: number;
  trim?: boolean;
};

export interface SoundEffectOutputs {
  output: AudioRef;
  fill: Record<string, unknown>;
}

export function soundEffect(inputs: SoundEffectInputs): Promise<SoundEffectOutputs> {
  return callNode<SoundEffectOutputs>("nodetool.game.SoundEffect", inputs);
}

// Game Music Loop — nodetool.game.MusicLoop
export type MusicLoopInputs = {
  audio?: AudioRef;
  slot_id?: string;
  seconds?: number;
  crossfade_ms?: number;
  trim?: boolean;
};

export interface MusicLoopOutputs {
  output: AudioRef;
  fill: Record<string, unknown>;
}

export function musicLoop(inputs: MusicLoopInputs): Promise<MusicLoopOutputs> {
  return callNode<MusicLoopOutputs>("nodetool.game.MusicLoop", inputs);
}
