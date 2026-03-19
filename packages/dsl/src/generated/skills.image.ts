// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef } from "../types.js";

// Image Skill — skills.image.ImageSkill
export interface ImageSkillInputs {
  model?: Connectable<unknown>;
  image?: Connectable<ImageRef>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface ImageSkillOutputs {
  image: ImageRef;
  text: string;
}

export function imageSkill(inputs: ImageSkillInputs): DslNode<ImageSkillOutputs> {
  return createNode("skills.image.ImageSkill", inputs as Record<string, unknown>, { outputNames: ["image", "text"] });
}
