// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function textToVideo(inputs) {
  return createNode("gemini.video.TextToVideo", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function imageToVideo(inputs) {
  return createNode("gemini.video.ImageToVideo", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  imageToVideo,
  textToVideo
};
