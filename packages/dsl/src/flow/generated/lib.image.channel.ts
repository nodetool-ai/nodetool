// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef } from "../../types.js";

// Channel Shuffle — lib.image.channel.Shuffle
export type ShuffleInputs = {
  image?: ImageRef;
  r_from?: number;
  g_from?: number;
  b_from?: number;
  a_from?: number;
};

export interface ShuffleOutputs {
  output: ImageRef;
}

export function shuffle(inputs: ShuffleInputs): Promise<ShuffleOutputs> {
  return callNode<ShuffleOutputs>("lib.image.channel.Shuffle", inputs);
}

// Channel Merge — lib.image.channel.Merge
export type MergeInputs = {
  image?: ImageRef;
  alpha?: ImageRef;
  alpha_channel?: number;
};

export interface MergeOutputs {
  output: ImageRef;
}

export function merge(inputs: MergeInputs): Promise<MergeOutputs> {
  return callNode<MergeOutputs>("lib.image.channel.Merge", inputs);
}
