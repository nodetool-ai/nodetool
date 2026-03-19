// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Document Skill — skills.document.DocumentSkill
export interface DocumentSkillInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface DocumentSkillOutputs {
  text: string;
  document: unknown;
}

export function documentSkill(inputs: DocumentSkillInputs): DslNode<DocumentSkillOutputs> {
  return createNode("skills.document.DocumentSkill", inputs as Record<string, unknown>, { outputNames: ["text", "document"] });
}
