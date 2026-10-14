import type { NodeClass, NodeRegistry } from "@nodetool-ai/node-sdk";
import { IMAGE_NODES } from "./nodes/image.js";
import { SKETCH_NODES } from "./nodes/sketch.js";
import { LIB_GRID_NODES } from "./nodes/lib-grid.js";
import { GAME_NODES as GAME_IMAGE_NODES } from "./nodes/game.js";
import { LIB_IMAGE_ENHANCE_NODES } from "./nodes/lib-image-enhance.js";
import { LIB_IMAGE_FILTER_NODES } from "./nodes/lib-image-filter.js";
import { LIB_IMAGE_DRAW_NODES } from "./nodes/lib-image-draw.js";
import { LIB_IMAGE_COLOR_GRADING_NODES } from "./nodes/lib-image-color-grading.js";
import { LIB_IMAGE_EFFECTS_NODES } from "./nodes/lib-image-effects.js";
import { LIB_IMAGE_KEYER_NODES } from "./nodes/lib-image-keyer.js";
import { LIB_IMAGE_MASK_NODES } from "./nodes/lib-image-mask.js";
import { LIB_IMAGE_CHANNEL_NODES } from "./nodes/lib-image-channel.js";
import { LIB_IMAGE_WARP_NODES } from "./nodes/lib-image-warp.js";
import { LIB_IMAGE_GENERATORS_NODES } from "./nodes/lib-image-generators.js";
import { LIB_IMAGE_FILTER_EXTRAS_NODES } from "./nodes/lib-image-filter-extras.js";
import { LIB_IMAGE_COLOR_NODES } from "./nodes/lib-image-color.js";

export * from "./nodes/image.js";
export * from "./nodes/sketch.js";
export * from "./nodes/lib-image-channel.js";
export * from "./nodes/lib-image-color-grading.js";
export * from "./nodes/lib-image-color.js";
export * from "./nodes/lib-image-draw.js";
export * from "./nodes/lib-image-effects.js";
export * from "./nodes/lib-image-enhance.js";
export * from "./nodes/lib-image-filter-extras.js";
export * from "./nodes/lib-image-filter.js";
export * from "./nodes/lib-image-generators.js";
export * from "./nodes/lib-image-keyer.js";
export * from "./nodes/lib-image-mask.js";
export * from "./nodes/lib-image-utils.js";
export * from "./nodes/lib-image-warp.js";
export * from "./nodes/lib-shader-utils.js";
export * from "./nodes/lib-grid.js";
export * from "./nodes/game.js";

export const ALL_IMAGE_NODES: readonly NodeClass[] = [
  ...IMAGE_NODES,
  ...SKETCH_NODES,
  ...LIB_GRID_NODES,
  ...GAME_IMAGE_NODES,
  ...LIB_IMAGE_ENHANCE_NODES,
  ...LIB_IMAGE_FILTER_NODES,
  ...LIB_IMAGE_DRAW_NODES,
  ...LIB_IMAGE_COLOR_GRADING_NODES,
  ...LIB_IMAGE_EFFECTS_NODES,
  ...LIB_IMAGE_KEYER_NODES,
  ...LIB_IMAGE_MASK_NODES,
  ...LIB_IMAGE_CHANNEL_NODES,
  ...LIB_IMAGE_WARP_NODES,
  ...LIB_IMAGE_GENERATORS_NODES,
  ...LIB_IMAGE_FILTER_EXTRAS_NODES,
  ...LIB_IMAGE_COLOR_NODES,
];

export function registerImageNodes(registry: NodeRegistry): void {
  for (const nodeClass of ALL_IMAGE_NODES) {
    registry.register(nodeClass);
  }
}
