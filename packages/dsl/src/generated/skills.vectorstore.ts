// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Vector Store Skill — skills.vectorstore.VectorStoreSkill
export interface VectorStoreSkillInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface VectorStoreSkillOutputs {
  text: string;
}

export function vectorStoreSkill(inputs: VectorStoreSkillInputs): DslNode<VectorStoreSkillOutputs, "text"> {
  return createNode("skills.vectorstore.VectorStoreSkill", inputs as Record<string, unknown>, { outputNames: ["text"], defaultOutput: "text" });
}
