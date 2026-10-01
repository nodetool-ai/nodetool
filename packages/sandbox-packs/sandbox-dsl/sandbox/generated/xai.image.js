// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function generateImage(inputs, options) {
  return createNode("xai.image.GenerateImage", inputs, { id: options?.id, outputNames: ["output", "revised_prompt"], outputTypes: { "output": "image", "revised_prompt": "str" } });
}
export {
  generateImage
};
