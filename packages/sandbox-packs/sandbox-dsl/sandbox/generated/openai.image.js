// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function createImage(inputs, options) {
  return createNode("openai.image.CreateImage", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function editImage(inputs, options) {
  return createNode("openai.image.EditImage", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function imageVariation(inputs, options) {
  return createNode("openai.image.ImageVariation", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
export {
  createImage,
  editImage,
  imageVariation
};
