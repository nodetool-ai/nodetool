// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function ytDlpDownload(inputs) {
  return createNode("lib.video.download.YtDlpDownload", inputs, { outputNames: ["video", "audio", "metadata", "subtitles", "thumbnail"] });
}
export {
  ytDlpDownload
};
