// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { ImageRef } from "../types.js";

// Create Image — codex.image.CreateImage
export type CreateImageInputs = {
  prompt?: Connectable<string>;
  model?: Connectable<unknown>;
  size?: Connectable<"auto" | "1024x1024" | "1536x1024" | "1024x1536">;
  quality?: Connectable<"auto" | "low" | "medium" | "high">;
};

export interface CreateImageOutputs {
  output: ImageRef;
}

export function createImage(inputs: CreateImageInputs, options?: NodeOptions): NodeWithOutputs<CreateImageOutputs, "output"> {
  return createNode("codex.image.CreateImage", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}
