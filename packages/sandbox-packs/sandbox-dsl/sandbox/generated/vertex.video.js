// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function textToVideo(inputs, options) {
  return createNode("vertex.video.TextToVideo", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
}
function imageToVideo(inputs, options) {
  return createNode("vertex.video.ImageToVideo", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
}
export {
  imageToVideo,
  textToVideo
};
