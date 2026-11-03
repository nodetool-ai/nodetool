// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function textToVideo(inputs) {
  return callNode("lib.wan2gp.TextToVideo", inputs);
}
function imageToVideo(inputs) {
  return callNode("lib.wan2gp.ImageToVideo", inputs);
}
function generate(inputs) {
  return callNode("lib.wan2gp.Generate", inputs);
}
function listModels(inputs) {
  return callNode("lib.wan2gp.ListModels", inputs);
}
export {
  generate,
  imageToVideo,
  listModels,
  textToVideo
};
