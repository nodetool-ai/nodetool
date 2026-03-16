// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, OutputHandle } from "../core.js";
import type { VideoRef } from "../types.js";

// yt-dlp Downloader Skill — skills.ytdlp.YtDlpDownloaderSkill
export interface YtDlpDownloaderSkillInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  url?: Connectable<string>;
  output_dir?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface YtDlpDownloaderSkillOutputs {
  video: OutputHandle<VideoRef>;
  text: OutputHandle<string>;
}

export function ytDlpDownloaderSkill(inputs: YtDlpDownloaderSkillInputs): DslNode<YtDlpDownloaderSkillOutputs> {
  return createNode("skills.ytdlp.YtDlpDownloaderSkill", inputs as Record<string, unknown>, { multiOutput: true });
}
