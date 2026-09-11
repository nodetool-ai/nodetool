// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, AudioRef, Entity, GameSlotSpec } from "../types.js";

// Sprite Sheet — nodetool.game.SpriteSheet
export type SpriteSheetInputs = {
  image?: Connectable<ImageRef>;
  slot?: Connectable<GameSlotSpec>;
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
  slot?: Connectable<GameSlotSpec>;
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
  slot?: Connectable<GameSlotSpec>;
  slot_id?: Connectable<string>;
  check_x?: Connectable<boolean>;
  check_y?: Connectable<boolean>;
  threshold?: Connectable<number>;
  repair?: Connectable<boolean>;
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
  slot?: Connectable<GameSlotSpec>;
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
  slot?: Connectable<GameSlotSpec>;
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

// Load Game Template — nodetool.game.LoadGameTemplate
export type LoadGameTemplateInputs = {
  template?: Connectable<string>;
};

export interface LoadGameTemplateOutputs {
  manifest: Record<string, unknown>;
  slots: GameSlotSpec[];
  slot: GameSlotSpec;
}

export function loadGameTemplate(inputs: LoadGameTemplateInputs): DslNode<LoadGameTemplateOutputs> {
  return createNode("nodetool.game.LoadGameTemplate", inputs, { outputNames: ["manifest", "slots", "slot"], streaming: true });
}

// Slot Prompt — nodetool.game.SlotPrompt
export type SlotPromptInputs = {
  slot?: Connectable<GameSlotSpec>;
  style?: Connectable<Entity>;
  cast?: Connectable<Entity[]>;
};

export interface SlotPromptOutputs {
  prompt: string;
  width: number;
  height: number;
  kind: string;
  checker: Record<string, unknown>;
  seconds: number;
}

export function slotPrompt(inputs: SlotPromptInputs): DslNode<SlotPromptOutputs> {
  return createNode("nodetool.game.SlotPrompt", inputs, { outputNames: ["prompt", "width", "height", "kind", "checker", "seconds"] });
}

// Export Godot Project — nodetool.game.ExportGodotProject
export type ExportGodotProjectInputs = {
  template?: Connectable<string>;
  name?: Connectable<string>;
  fills?: Connectable<(ImageRef | AudioRef)[]>;
  directory?: Connectable<string>;
  verify?: Connectable<boolean>;
};

export interface ExportGodotProjectOutputs {
  output: Record<string, unknown>;
  directory: string;
  files: string[];
  verified: boolean;
  verification: Record<string, unknown>;
  errors: string[];
  archive: string;
}

export function exportGodotProject(inputs: ExportGodotProjectInputs): DslNode<ExportGodotProjectOutputs> {
  return createNode("nodetool.game.ExportGodotProject", inputs, { outputNames: ["output", "directory", "files", "verified", "verification", "errors", "archive"] });
}
