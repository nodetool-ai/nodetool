// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { ImageRef } from "../types.js";

// Channel Shuffle — lib.image.channel.Shuffle
export type ShuffleInputs = {
  image?: Connectable<ImageRef>;
  r_from?: Connectable<number>;
  g_from?: Connectable<number>;
  b_from?: Connectable<number>;
  a_from?: Connectable<number>;
};

export interface ShuffleOutputs {
  output: ImageRef;
}

export function shuffle(inputs: ShuffleInputs, options?: NodeOptions): NodeWithOutputs<ShuffleOutputs, "output"> {
  return createNode("lib.image.channel.Shuffle", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}

// Channel Merge — lib.image.channel.Merge
export type MergeInputs = {
  image?: Connectable<ImageRef>;
  alpha?: Connectable<ImageRef>;
  alpha_channel?: Connectable<number>;
};

export interface MergeOutputs {
  output: ImageRef;
}

export function merge(inputs: MergeInputs, options?: NodeOptions): NodeWithOutputs<MergeOutputs, "output"> {
  return createNode("lib.image.channel.Merge", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}
