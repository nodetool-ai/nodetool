// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, OutputHandle } from "../core.js";
import type { ImageRef, AudioRef, VideoRef } from "../types.js";

// YouTube Downloader — lib.ytdlp.YtDlpDownload
export interface YtDlpDownloadInputs {
  url?: Connectable<string>;
  mode?: Connectable<unknown>;
  format_selector?: Connectable<string>;
  container?: Connectable<string>;
  subtitles?: Connectable<boolean>;
  thumbnail?: Connectable<boolean>;
  overwrite?: Connectable<boolean>;
  rate_limit_kbps?: Connectable<number>;
  timeout?: Connectable<number>;
}

export interface YtDlpDownloadOutputs {
  video: OutputHandle<VideoRef>;
  audio: OutputHandle<AudioRef>;
  metadata: OutputHandle<Record<string, unknown>>;
  subtitles: OutputHandle<string>;
  thumbnail: OutputHandle<ImageRef>;
}

export function ytDlpDownload(inputs: YtDlpDownloadInputs): DslNode<YtDlpDownloadOutputs> {
  return createNode("lib.ytdlp.YtDlpDownload", inputs as Record<string, unknown>, { multiOutput: true });
}
