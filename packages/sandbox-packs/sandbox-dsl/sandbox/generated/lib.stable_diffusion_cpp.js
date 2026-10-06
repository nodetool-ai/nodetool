// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function generateImage(inputs, options) {
  return createNode("lib.stable_diffusion_cpp.GenerateImage", inputs, { id: options?.id, outputNames: ["output", "images"], outputTypes: { "output": "image", "images": "list[image]" } });
}
export {
  generateImage
};
