// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, OutputHandle } from "../core.js";

// Browser Skill — skills.browser.BrowserSkill
export interface BrowserSkillInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface BrowserSkillOutputs {
  text: OutputHandle<string>;
}

export function browserSkill(inputs: BrowserSkillInputs): DslNode<BrowserSkillOutputs> {
  return createNode("skills.browser.BrowserSkill", inputs as Record<string, unknown>, { multiOutput: true });
}
