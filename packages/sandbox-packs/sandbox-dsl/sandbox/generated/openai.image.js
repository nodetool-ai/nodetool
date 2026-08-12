// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function createImage(inputs) {
  return createNode("openai.image.CreateImage", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function editImage(inputs) {
  return createNode("openai.image.EditImage", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function imageVariation(inputs) {
  return createNode("openai.image.ImageVariation", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  createImage,
  editImage,
  imageVariation
};
