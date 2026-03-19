// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Filesystem Skill — skills.filesystem.FilesystemSkill
export interface FilesystemSkillInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface FilesystemSkillOutputs {
  text: string;
}

export function filesystemSkill(inputs: FilesystemSkillInputs): DslNode<FilesystemSkillOutputs, "text"> {
  return createNode("skills.filesystem.FilesystemSkill", inputs as Record<string, unknown>, { outputNames: ["text"], defaultOutput: "text" });
}
