// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { ImageRef, AudioRef, VideoRef } from "../types.js";

// YouTube Downloader — lib.video.download.YtDlpDownload
export type YtDlpDownloadInputs = {
  url?: Connectable<string>;
  mode?: Connectable<"video" | "audio" | "metadata">;
  format_selector?: Connectable<string>;
  container?: Connectable<string>;
  subtitles?: Connectable<boolean>;
  sub_langs?: Connectable<string>;
  thumbnail?: Connectable<boolean>;
  overwrite?: Connectable<boolean>;
  rate_limit_kbps?: Connectable<number>;
  timeout?: Connectable<number>;
};

export interface YtDlpDownloadOutputs {
  video: VideoRef;
  audio: AudioRef;
  metadata: Record<string, unknown>;
  subtitles: string;
  thumbnail: ImageRef;
}

export function ytDlpDownload(inputs: YtDlpDownloadInputs, options?: NodeOptions): NodeWithOutputs<YtDlpDownloadOutputs> {
  return createNode("lib.video.download.YtDlpDownload", inputs, { id: options?.id, outputNames: ["video", "audio", "metadata", "subtitles", "thumbnail"], outputTypes: {"video":"video","audio":"audio","metadata":"dict","subtitles":"str","thumbnail":"image"} });
}
