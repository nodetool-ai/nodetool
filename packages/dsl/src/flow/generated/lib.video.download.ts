// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef, AudioRef, VideoRef } from "../../types.js";

// YouTube Downloader — lib.video.download.YtDlpDownload
export type YtDlpDownloadInputs = {
  url?: string;
  mode?: "video" | "audio" | "metadata";
  format_selector?: string;
  container?: string;
  subtitles?: boolean;
  sub_langs?: string;
  thumbnail?: boolean;
  overwrite?: boolean;
  rate_limit_kbps?: number;
  timeout?: number;
};

export interface YtDlpDownloadOutputs {
  video: VideoRef;
  audio: AudioRef;
  metadata: Record<string, unknown>;
  subtitles: string;
  thumbnail: ImageRef;
}

export function ytDlpDownload(inputs: YtDlpDownloadInputs): Promise<YtDlpDownloadOutputs> {
  return callNode<YtDlpDownloadOutputs>("lib.video.download.YtDlpDownload", inputs);
}
