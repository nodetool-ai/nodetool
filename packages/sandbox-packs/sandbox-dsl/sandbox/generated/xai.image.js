// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function generateImage(inputs) {
  return createNode("xai.image.GenerateImage", inputs, { outputNames: ["output", "revised_prompt"] });
}
export {
  generateImage
};
