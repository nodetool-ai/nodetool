// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, OutputHandle } from "../core.js";
import type { AudioRef, VideoRef } from "../types.js";

// FFmpeg Skill — skills.ffmpeg.FfmpegSkill
export interface FfmpegSkillInputs {
  model?: Connectable<unknown>;
  audio?: Connectable<AudioRef>;
  video?: Connectable<VideoRef>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface FfmpegSkillOutputs {
  video: OutputHandle<VideoRef>;
  audio: OutputHandle<AudioRef>;
  text: OutputHandle<string>;
}

export function ffmpegSkill(inputs: FfmpegSkillInputs): DslNode<FfmpegSkillOutputs> {
  return createNode("skills.ffmpeg.FfmpegSkill", inputs as Record<string, unknown>, { multiOutput: true });
}
