// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function ytDlpDownload(inputs, options) {
  return createNode("lib.video.download.YtDlpDownload", inputs, { id: options?.id, outputNames: ["video", "audio", "metadata", "subtitles", "thumbnail"], outputTypes: { "video": "video", "audio": "audio", "metadata": "dict", "subtitles": "str", "thumbnail": "image" } });
}
export {
  ytDlpDownload
};
