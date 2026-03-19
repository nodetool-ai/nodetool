// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { AudioRef, VideoRef } from "../types.js";

// Media Skill — skills.media.MediaSkill
export interface MediaSkillInputs {
  model?: Connectable<unknown>;
  audio?: Connectable<AudioRef>;
  video?: Connectable<VideoRef>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface MediaSkillOutputs {
  video: VideoRef;
  audio: AudioRef;
  text: string;
}

export function mediaSkill(inputs: MediaSkillInputs): DslNode<MediaSkillOutputs> {
  return createNode("skills.media.MediaSkill", inputs as Record<string, unknown>, { outputNames: ["video", "audio", "text"] });
}
