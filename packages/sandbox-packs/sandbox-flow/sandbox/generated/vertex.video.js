// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function textToVideo(inputs) {
  return callNode("vertex.video.TextToVideo", inputs);
}
function imageToVideo(inputs) {
  return callNode("vertex.video.ImageToVideo", inputs);
}
export {
  imageToVideo,
  textToVideo
};
