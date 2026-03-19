// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Spreadsheet Skill — skills.spreadsheet.SpreadsheetSkill
export interface SpreadsheetSkillInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface SpreadsheetSkillOutputs {
  text: string;
}

export function spreadsheetSkill(inputs: SpreadsheetSkillInputs): DslNode<SpreadsheetSkillOutputs, "text"> {
  return createNode("skills.spreadsheet.SpreadsheetSkill", inputs as Record<string, unknown>, { outputNames: ["text"], defaultOutput: "text" });
}
