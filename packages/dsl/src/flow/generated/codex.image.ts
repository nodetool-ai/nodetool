// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef } from "../../types.js";

// Create Image — codex.image.CreateImage
export type CreateImageInputs = {
  prompt?: string;
  model?: unknown;
  size?: "auto" | "1024x1024" | "1536x1024" | "1024x1536";
  quality?: "auto" | "low" | "medium" | "high";
};

export interface CreateImageOutputs {
  output: ImageRef;
}

export function createImage(inputs: CreateImageInputs): Promise<CreateImageOutputs> {
  return callNode<CreateImageOutputs>("codex.image.CreateImage", inputs);
}
