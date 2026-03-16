// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, OutputHandle } from "../core.js";

// PPTX Skill — skills.pptx.PptxSkill
export interface PptxSkillInputs {
  model?: Connectable<unknown>;
  document?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface PptxSkillOutputs {
  document: OutputHandle<unknown>;
  text: OutputHandle<string>;
}

export function pptxSkill(inputs: PptxSkillInputs): DslNode<PptxSkillOutputs> {
  return createNode("skills.pptx.PptxSkill", inputs as Record<string, unknown>, { multiOutput: true });
}
