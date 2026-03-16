// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, OutputHandle } from "../core.js";

// PDF-lib Skill — skills.pdf_lib.PdfLibSkill
export interface PdfLibSkillInputs {
  model?: Connectable<unknown>;
  document?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface PdfLibSkillOutputs {
  document: OutputHandle<unknown>;
  text: OutputHandle<string>;
}

export function pdfLibSkill(inputs: PdfLibSkillInputs): DslNode<PdfLibSkillOutputs> {
  return createNode("skills.pdf_lib.PdfLibSkill", inputs as Record<string, unknown>, { multiOutput: true });
}
