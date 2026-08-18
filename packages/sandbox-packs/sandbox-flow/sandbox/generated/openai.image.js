// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function createImage(inputs) {
  return callNode("openai.image.CreateImage", inputs);
}
function editImage(inputs) {
  return callNode("openai.image.EditImage", inputs);
}
function imageVariation(inputs) {
  return callNode("openai.image.ImageVariation", inputs);
}
export {
  createImage,
  editImage,
  imageVariation
};
