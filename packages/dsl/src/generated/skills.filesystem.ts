// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, OutputHandle } from "../core.js";

// Filesystem Skill — skills.filesystem.FilesystemSkill
export interface FilesystemSkillInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface FilesystemSkillOutputs {
  text: OutputHandle<string>;
}

export function filesystemSkill(inputs: FilesystemSkillInputs): DslNode<FilesystemSkillOutputs> {
  return createNode("skills.filesystem.FilesystemSkill", inputs as Record<string, unknown>, { multiOutput: true });
}
