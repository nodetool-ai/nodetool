// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function ytDlpDownload(inputs) {
  return callNode("lib.video.download.YtDlpDownload", inputs);
}
export {
  ytDlpDownload
};
