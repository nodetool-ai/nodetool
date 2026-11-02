// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function textToVideo(inputs, options) {
  return createNode("lib.wan2gp.TextToVideo", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
}
function imageToVideo(inputs, options) {
  return createNode("lib.wan2gp.ImageToVideo", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "video" }, defaultOutput: "output" });
}
function generate(inputs, options) {
  return createNode("lib.wan2gp.Generate", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "union[image, video, audio, model_3d]" }, defaultOutput: "output" });
}
function listModels(inputs, options) {
  return createNode("lib.wan2gp.ListModels", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "list[dict]" }, defaultOutput: "output" });
}
export {
  generate,
  imageToVideo,
  listModels,
  textToVideo
};
