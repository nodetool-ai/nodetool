// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, OutputHandle } from "../core.js";

// Document Skill — skills.document.DocumentSkill
export interface DocumentSkillInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface DocumentSkillOutputs {
  text: OutputHandle<string>;
  document: OutputHandle<unknown>;
}

export function documentSkill(inputs: DocumentSkillInputs): DslNode<DocumentSkillOutputs> {
  return createNode("skills.document.DocumentSkill", inputs as Record<string, unknown>, { multiOutput: true });
}
