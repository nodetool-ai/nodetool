// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// DOCX Skill — skills.docx.DocxSkill
export interface DocxSkillInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface DocxSkillOutputs {
  document: unknown;
  text: string;
}

export function docxSkill(inputs: DocxSkillInputs): DslNode<DocxSkillOutputs> {
  return createNode("skills.docx.DocxSkill", inputs as Record<string, unknown>, { outputNames: ["document", "text"] });
}
